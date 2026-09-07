# AI Research Analyst — Implementation Plan

**Status:** proposed
**Created:** 2026-09-07
**Scope:** the AI analyst agent (`components/AIAgent.tsx`, `app/api/agent/route.ts`) and the
multi-tenant + BYOK foundation it now depends on.

---

## 1. Decisions this plan assumes

| Decision | Choice | Consequence |
|---|---|---|
| Deployment target | Deployed, multiple users eventually | Auth model must grow past admin-only |
| Provider layer | Vercel AI SDK (`ai`) | One interface for streaming + tool calling |
| v1 providers | OpenAI, Anthropic, Google | Every `baseURL` is a constant → no SSRF surface |
| Key storage | Per-user, dashboard-managed, Supabase Vault | Inference cost moves off our bill |

### Explicitly ruled out

- **Claude Code / Codex CLI as providers.** Claude Pro/Max and ChatGPT Plus/Pro authorize use
  through first-party clients. Using subscription auth as the backend of a hosted multi-tenant
  service is not permitted by either provider. There is no compliant version of this in the
  chosen deployment model.
- **Ollama / local models.** On a deployed server `localhost:11434` is *our* server, not the
  user's machine. Local inference only works when the app runs on the same box as the model.
- **Generic "OpenAI-compatible" provider** (Grok, DeepSeek, Kimi, GLM, Qwen) — deferred to v2,
  because a user-settable `base_url` is an SSRF vector that needs host allowlisting first.

### Version note

`ai` is at **7.0.93**; provider packages `@ai-sdk/openai` / `@ai-sdk/anthropic` /
`@ai-sdk/google` are at **4.x**. This is a major version ahead of most published examples.
**Before writing Phase 3 code, verify the actual export surface** (`streamText`, `useChat`,
the stream-response helper name) against the installed package's own types and docs. Do not
write it from memory.

---

## 2. Phase 0 — Bug fixes

Independent of everything below. Ship first; each is small and currently live.

> Deliberately **not** included: the client-side defects (errors pushed into `messages`,
> no history trimming, no abort). Phase 3 deletes that code path entirely — fixing it now
> is wasted work.

### 0.1 Knowledge-base search returns nothing — `app/api/agent/route.ts:30,39`

`words.join(" | ")` combined with `type: "websearch"` produces an **AND**, not an OR.
Verified against the live database:

```
websearch_to_tsquery('english', 'vintage | studded | hobo')  →  'vintag' & 'stud' & 'hobo'
to_tsquery('english',        'vintage | studded | hobo')  →  'vintag' | 'stud' | 'hobo'
```

A five-word question therefore requires all five stems in one row. Across 12 rows that
effectively never matches.

**Fix:** drop `type: "websearch"` so supabase-js uses `to_tsquery` (which honours `|`), or
keep `websearch` and join with `" or "`.

**Verify:** a question containing one KB term returns a row; `[api/agent] knowledge base
returned no rows` stops appearing for on-topic questions.

### 0.2 Dead full-text index — `supabase/migrations/004_knowledge_base.sql:16`

Index is on `to_tsvector('english', title || ' ' || content)`; the query filters
`to_tsvector('english', content)`. `EXPLAIN` confirms a sequential scan.

**Fix:** new migration adding a generated `tsv` column over `title || ' ' || content`,
indexed, with the query targeting it. Also brings `title` into search and lets the seeded
but currently unused `keywords` array contribute.

**Verify:** `EXPLAIN` shows a bitmap index scan.

### 0.3 Unhandled crash on malformed context — `app/api/agent/route.ts:129`

`classifyTrend(trends.interest_over_time)` runs **outside** the try block on a
client-supplied value that is cast (`as TrendsData`) but never validated. A `{}` body
throws a TypeError → unhandled 500 with no JSON the UI can render. Same for the
`Math.max(...)` spread in the prompt template.

**Fix:** validate `trendsContext` shape before use; treat a bad shape as "no trend data
loaded" rather than an error. Move classification inside the try.

**Verify:** `POST /api/agent` with `trendsContext: {}` returns a normal answer, not a 500.

### 0.4 Error taxonomy — `app/api/agent/route.ts:174`

Every upstream failure collapses to one 502 and one string. "Please try again" is actively
wrong for exhausted credits — retrying can never succeed.

**Fix:** return a stable `code` alongside the message:

| Condition | `code` | HTTP |
|---|---|---|
| `insufficient_quota` / no credits | `no_credits` | 503 |
| 401 / revoked key | `bad_key` | 502 |
| 429 rate limit (retryable) | `rate_limited` | 429 + `Retry-After` |
| context length exceeded | `too_long` | 400 |
| timeout / 5xx | `upstream_down` | 503 |

**Verify:** with a zero-balance key the UI says the account is out of credits and offers a
settings link, not "try again".

### 0.5 Call timeout — `app/api/agent/route.ts:157`

No timeout is set, and the SDK default `maxRetries: 2` meant the 429 was retried twice
before failing — most of the observed 2.8s.

**Fix:** explicit `timeout`; `maxRetries: 0` for non-retryable classes.

---

## 3. Phase 1 — Multi-tenant foundation

**Load-bearing. Nothing after this works without it.** Bigger than it looks: today a
`viewer` can authenticate and is then bounced off every route.

Current state:

- `lib/auth.ts:33` — `getAdminUser()` returns `null` unless `role === 'admin'`; every API
  route gates on it.
- `proxy.ts:93` — non-admins are redirected to `/login?error=unauthorized` from every page.
- `007_admin_rls.sql:27` — `trends` is admin-only.
- `007_admin_rls.sql:47` — `knowledge_base` is admin-only, so a viewer gets zero RAG
  grounding.
- `006_fix_role_default.sql` — the trigger already assigns `viewer` to new signups. The role
  exists; it just has no grants.

### 1.1 Define what `viewer` may do

Replace the binary admin check with a capability check. Proposed:

| Capability | viewer | admin |
|---|---|---|
| Run trend searches | ✅ (own quota) | ✅ |
| See own search history | ✅ | ✅ |
| See *others'* history | ❌ | ❌ |
| Chat with the analyst | ✅ (own key) | ✅ |
| Read knowledge base | ✅ | ✅ |
| Write knowledge base | ❌ | ✅ |
| Manage own credentials | ✅ | ✅ |
| See platform usage/costs | ❌ | ✅ |

`lib/auth.ts` gains `getUser()` (any authenticated profile) beside the existing
`getAdminUser()`. Routes switch to `getUser()`; admin-only surfaces keep `getAdminUser()`.

### 1.2 Split `searches` from `trends`

`trends` (`001_create_trends.sql:2`) has **no `user_id`** — it is a shared global cache
keyed on `(keyword, date_range)`. That is correct and worth keeping: SerpAPI is metered, and
one user's lookup should serve everyone.

But `app/history/page.tsx:25` queries `trends` **directly from the browser**, so in a
multi-user world every user's search history is visible to every other user. Product
research history is exactly the thing people treat as confidential. Worse,
`app/history/page.tsx:34` deletes from `trends` — one user clearing their history would
evict another user's cached data.

**Fix:** new `searches` table — `(id, user_id, keyword, date_range, trend_id → trends.id,
created_at)`. `trends` stays the shared cache and becomes readable by any authenticated user
(insert/update service-role only). `searches` is RLS'd to `user_id = auth.uid()`.

### 1.3 Open `knowledge_base` to authenticated reads

Migration 007 locked it to admins. Viewers need it for grounding. New policy: `SELECT` for
`authenticated`; writes stay admin-only.

### 1.4 `proxy.ts` and route guards

`proxy.ts:93` currently redirects any non-admin away from every page. Change to: an
authenticated user with a valid role passes; the role claim from
`008_access_token_hook.sql` continues to avoid the per-request profile query.

> `proxy.ts` calls `supabase.auth.getUser()` on **every** matched request — that is the
> `proxy.ts: 660ms / 807ms / 831ms` in the dev logs. Worth addressing while this file is
> already open.

Also add `/health` to `PUBLIC_PATHS` and have it return 200. It currently 307s to `/login`,
which fails every platform health probe (Vercel, Docker `HEALTHCHECK`, uptime monitors) —
and something already polls it roughly every 310 seconds.

### 1.5 Rewrite `app/history/page.tsx`

Query `searches` joined to `trends` instead of `trends` directly. Delete removes the
`searches` row only, never the shared cache entry.

**Verify:** two accounts; each sees only its own history; deleting from one does not affect
the other's results or the cache.

---

## 4. Phase 2 — Per-user credentials (BYOK)

### 4.1 Storage

New table `provider_credentials`, unique on `(user_id, provider)`:

| Column | Purpose |
|---|---|
| `user_id` | FK `auth.users`, RLS anchor |
| `provider` | `openai` \| `anthropic` \| `google` |
| `vault_secret_id` | UUID from `vault.create_secret` — the key itself never lands in this table |
| `key_hint` | `sk-…4f2a`, display only |
| `default_model` | per-provider model choice |
| `status` | `untested` \| `valid` \| `invalid` \| `no_credits` |
| `last_verified_at`, `last_used_at`, `created_at` | staleness + audit |

**Supabase Vault** over app-level AES: Supabase manages the encryption key, so there is no
`CREDENTIALS_ENCRYPTION_KEY` for us to rotate, leak, or lose. We store only a UUID.

RLS: users read/write their own rows' **metadata**. Decryption happens service-role only,
inside a route handler, after the auth guard.

### 4.2 `lib/credentials.ts`

- `saveCredential(userId, provider, key)` → validate, `vault.create_secret`, upsert row
- `getDecryptedKey(userId, provider)` → service-role read, in-memory only
- `listCredentials(userId)` → metadata only, never the key

**Never cache plaintext in a module-level variable.** That would recreate the `_openai`
singleton problem (`route.ts:11`) but holding a secret.

### 4.3 API + UI

- `POST /api/credentials` — save/replace (key in body, write-only)
- `GET /api/credentials` — returns `provider`, `key_hint`, `status`, `last_used_at`. **Never
  the key.**
- `DELETE /api/credentials/:provider`
- `POST /api/credentials/:provider/test` — cheap probe (`GET /v1/models` or a 1-token
  completion)

New `/settings` page, added to `Navbar.tsx:14`'s `links`. One card per provider: status pill,
masked hint, Test connection, Replace, Remove, default-model dropdown.

### 4.4 Validate on save

The probe on save is the single highest-value piece of this phase — it converts "the AI
analyst is temporarily unavailable" three days later into "this key has no credits" at the
moment of paste.

### 4.5 Secret hygiene

- Sentry `beforeSend` scrubber — SDK errors can carry request context including headers.
  `route.ts:172` already reports exceptions.
- Never log the key; never include it in an error message.
- Document the Vault rotation path.

**Verify:** save a deliberately invalid key → immediate `invalid`. Inspect the table → no
plaintext. Trigger an error → confirm nothing sensitive reaches Sentry.

---

## 5. Phase 3 — AI SDK migration

### 5.1 Dependencies

Add `ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`. Remove `openai` once the
route is migrated.

**First task in this phase: read the installed version's types.** `ai@7` is a major version
ahead of most examples in circulation.

### 5.2 Model registry — `lib/models.ts`

Static catalogue: provider, model id, display name, context window, input/output price,
capability flags. Drives the settings dropdown, the agent header, and cost estimation.

Anthropic entries (per current pricing):

| Model | ID | Context | $/1M in | $/1M out |
|---|---|---|---|---|
| Claude Opus 5 | `claude-opus-5` | 1M | $5 | $25 |
| Claude Sonnet 5 | `claude-sonnet-5` | 1M | $2 | $10 |
| Claude Haiku 4.5 | `claude-haiku-4-5` | 200K | $1 | $5 |

### 5.3 Rewrite `app/api/agent/route.ts`

New flow: `getUser()` → resolve provider + model (credential row, or a validated request
override) → decrypt via Vault → build system prompt → `streamText()` → return the SDK's
stream response.

The request-body validation at `route.ts:110-120` needs rewriting for the SDK's message
shape, and `ChatMessage` (`lib/types.ts:41`) is replaced by the SDK's own types.

### 5.4 Rewrite `components/AIAgent.tsx`

Replace the hand-rolled `send()` (`AIAgent.tsx:44`) with the SDK's chat hook. This deletes,
rather than fixes, four known defects:

- errors pushed into `messages` and replayed to the model as assistant turns (`:66`)
- no history trimming — the chat hard-breaks at message 41 (`:55`)
- no abort on close/unmount
- no streaming

Still to do by hand in this phase:

- render markdown (bubbles are `whitespace-pre-wrap` at `:125`, so the model's bullets and
  bold render as literal `-` and `**`)
- dialog semantics: the panel is always mounted and merely translated off-screen (`:82`), so
  it stays tabbable and screen-reader-visible when closed. Needs `role="dialog"`,
  Escape-to-close, focus trap, `inert` when closed.
- header (`:93`) reads the real selected model instead of the hardcoded
  "Online · GPT-4o mini"
- check the finish reason and surface truncation instead of silently cutting off
- suggested questions available before a search has run, and conditioned on the trend
  classification

### 5.5 Anthropic provider options

Route through the SDK's provider-options passthrough:

- **Prompt caching** — the system prompt is a large, mostly-stable prefix. Mark it cacheable
  and keep the volatile trends block *after* it. This is the main cost lever.
- **Adaptive thinking** — `{type: "adaptive"}`. Note `budget_tokens` is **rejected with a
  400** on Opus 5 and Sonnet 5, and assistant prefills also 400 on this generation. Do not
  carry over older patterns.

### 5.6 Prompt

`max_tokens: 600` (`route.ts:163`) is tight for the strategy answers the prompt asks for.
Raise it, and check the finish reason.

**Verify:** answers stream token by token; all three providers work; closing mid-stream
aborts the request; a 41st message succeeds.

---

## 6. Phase 4 — Cost controls

### 6.1 Trial quota for keyless users

With open signup, keeping `OPENAI_API_KEY` as a fallback means every new account spends our
credits. Either require BYOK outright, or grant a hard lifetime trial (N messages, tracked
the way `rate_limits` already is) before a key is required.

### 6.2 Rate limit: fail closed on server keys

`lib/rate-limit.ts:53` returns `allowed: true` when the database is unreachable. Correct
when we were the only user; with a shared trial key it is an open bar during a Supabase
blip.

**Fix:** fail **open** for BYOK requests (user's own key, user's own money); fail **closed**
for anything spending a server key.

### 6.3 Usage logging

Record per request: `user_id`, provider, model, input/output tokens, estimated cost,
finish reason, latency. Never the key. Admins see platform totals; users see their own.

This is what would have made the outage visible before it became an outage.

---

## 7. Phase 5 — Provider fallback chain

When a user has several providers configured, a `no_credits` or `rate_limited` failure
automatically retries the next in their preference order. Surface which provider answered.
This makes the original failure structurally impossible for any user with two keys.

---

## 8. Deferred to v2

| Item | Blocked on |
|---|---|
| Generic OpenAI-compatible provider (Grok, DeepSeek, Kimi, GLM, Qwen) | Host allowlist + SSRF review |
| `search_trends` tool calling — the agent runs its own comparisons | Phase 3 landing first |
| Embedding-based retrieval (`pgvector`) | KB passing ~50 rows; at 12 rows, inlining the whole KB into the prompt has better recall and costs less than the round trip |
| Conversation persistence | Product decision on retention |

---

## 9. Sequencing

```
Phase 0  ──────────────►  ships independently, today
                             │
Phase 1  ────────────────────┴──►  load-bearing; blocks 2 and 4
                                      │
Phase 2  ─────────────────────────────┴──►  blocks 3
                                              │
Phase 3  ─────────────────────────────────────┴──►  blocks 5
                                                      │
Phase 4  ─────────────────────────────────────────────┤
Phase 5  ─────────────────────────────────────────────┘
```

Migrations, in order: `011_searches_table`, `012_viewer_capabilities`,
`013_kb_fts_fix`, `014_provider_credentials`, `015_usage_log`.

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| `ai@7` API differs from all published examples | Read installed types before writing Phase 3; budget time for it |
| Phase 1 touches auth on a live app | Migrations are additive; keep the admin path working throughout; test with two accounts before relaxing `proxy.ts` |
| Vault adds a Supabase-specific dependency | Accepted — the alternative is owning key rotation |
| A user's key leaks via logs or Sentry | Scrubber lands in Phase 2, before any key is stored |
| Trial quota abuse via repeat signups | Invite-only signup is already in place (commit `e66f597`) |
