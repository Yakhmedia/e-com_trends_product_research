# Implementation Plan: Pre-Deployment Improvements

**Project:** Product Trends Dashboard (AI-Ecommerce)
**Goal:** Close the blockers found in the 2026-09-06 review so the app can go live as an **admin-only internal tool**
**Status:** Not deployable — two hard blockers outstanding
**Companion doc:** `IMPLEMENTATION_PUBLIC_DEPLOYMENT.md` (the original plan; this one supersedes it where they overlap)
**Last updated:** 2026-09-06

---

## Executive summary

`npm run build` passes clean, RLS is enabled on all three tables, the API routes carry real auth guards and input validation, and the security headers are solid. But the app **cannot be deployed today, and in fact nobody can log into it right now**:

1. `NEXT_PUBLIC_SUPABASE_URL` has a `/rest/v1/` suffix, so every auth call 404s against PostgREST. Login is completely non-functional.
2. Public email signup is enabled on the production Supabase project while `public.profiles.role` defaults to `'admin'`. Anyone who registers through the public auth API becomes an admin.

Three of four server secrets are also misnamed or absent, which silently degrades SerpAPI, OpenAI, the service-role client, and Sentry — so none of the above would even alert you.

| Phase | Focus | Effort (est.) | Blocker? |
|-------|-------|---------------|----------|
| 0 | Configuration blockers | 1–2 hours | **Yes** |
| 1 | Authorization moved into the database | 0.5 day | **Yes** |
| 2 | Auth-flow correctness (proxy, cookies, redirects) | 0.5 day | **Yes** |
| 3 | Login UX, accessibility, password recovery | 1 day | Recommended |
| 4 | Production polish & observability | 0.5 day | Recommended |

**Phases 0–2 are mandatory before any public URL goes live.**

---

## Evidence

Findings were verified on 2026-09-06 against the running dev server and the live Supabase project `gtkfvwdlcomhxncleddr` (read-only queries only):

- `GET https://<ref>.supabase.co/rest/v1/auth/v1/settings` returns `404 PGRST125 "Invalid path specified in request URL"`; the same path without `/rest/v1/` returns `200`.
- Auth settings report `"disable_signup": false`, `"email": true`, `"mailer_autoconfirm": false`.
- `information_schema.columns` reports `public.profiles.role` default `'admin'::text` in production.
- Live row counts: 1 auth user, 1 admin profile, 22 trends rows, **0 knowledge_base rows**.
- Supabase security advisor: one open warning, `auth_leaked_password_protection`.

---

## Phase 0 — Configuration blockers

**Objective:** Make login work at all, and stop the production project handing out admin accounts.

### 0.1 Fix the Supabase URL

**File:** `.env` (and the hosting provider's env settings)

**Current problem:** `NEXT_PUBLIC_SUPABASE_URL` ends in `/rest/v1/`. supabase-js appends its own paths (`/auth/v1`, `/rest/v1`) to this base, so every auth request is routed to PostgREST and rejected.

**Tasks:**

- [ ] Change the value to the bare project URL — `https://gtkfvwdlcomhxncleddr.supabase.co`, no path, no trailing slash
- [ ] Restart the dev server (`NEXT_PUBLIC_*` values are inlined at build time)

**Acceptance criteria:**

- `curl -H "apikey: $ANON_KEY" "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/settings"` returns `200`
- Signing in at `/login` reaches `/dashboard` instead of bouncing back

### 0.2 Correct the server environment variable names

**File:** `.env`

**Current problem:** the `NEXT_` prefix is meaningless in Next.js — only `NEXT_PUBLIC_` is special — so the code reads `undefined` for three secrets.

| Code reads | `.env` currently has | Impact today |
|---|---|---|
| `SERP_API_KEY` | `NEXT_SERP_API_KEY` | `/api/trends` sends `&api_key=undefined`; `safeFetch` swallows the failure into an empty chart |
| `OPENAI_API_KEY` | `NEXT_OPENAI_API_KEY` | `/api/agent` throws an unhandled 500 on the completion call |
| `SUPABASE_SERVICE_ROLE_KEY` | *(absent)* | `getSupabaseAdminClient()` takes its "dev only" anon fallback in production with only a `console.warn` |
| `NEXT_PUBLIC_SENTRY_DSN` | *(absent)* | Sentry captures nothing, so none of the above pages you |

**Tasks:**

- [ ] Rename `NEXT_SERP_API_KEY` to `SERP_API_KEY`
- [ ] Rename `NEXT_OPENAI_API_KEY` to `OPENAI_API_KEY`
- [ ] Add `SUPABASE_SERVICE_ROLE_KEY` (Supabase Dashboard → Settings → API → `service_role`)
- [ ] Add `NEXT_PUBLIC_SENTRY_DSN`
- [ ] Turn the anon-key fallback in `lib/supabase-admin.ts:17` into a hard throw when `NODE_ENV === "production"`
- [ ] Create `.env.example` documenting every key by name with empty values (`.gitignore` already covers `.env*`)

**Acceptance criteria:**

- A trends search returns real chart data
- The AI Analyst returns a completion rather than a 500
- Booting with `NODE_ENV=production` and no service-role key fails fast with a clear error
- A deliberately thrown client error appears in the Sentry project

### 0.3 Disable public signup

**Location:** Supabase Dashboard → Authentication → Providers → Email

**Current problem:** `disable_signup: false` with email auth enabled. The anon key ships in the client bundle by design, so registration does not require app access — an attacker calls the auth API directly.

**Tasks:**

- [ ] Disable "Enable email signups" (invite-only from here on)
- [ ] Enable leaked-password protection (Authentication → Policies) — clears the outstanding advisor warning
- [ ] Confirm the single existing admin user still signs in afterwards

**Acceptance criteria:**

- `/auth/v1/settings` reports `"disable_signup": true`
- A `POST /auth/v1/signup` with a fresh email is rejected

### 0.4 Stop the database defaulting new profiles to admin

**Migration:** `supabase/migrations/006_fix_role_default.sql`

**Current problem:** `role text NOT NULL DEFAULT 'admin'`. The comment at `app/login/page.tsx:41` claims roles can only be granted by a DBA; the column default contradicts it. The `"Users insert own profile"` policy also has no check on `role`, so a client can insert `role: 'admin'` explicitly.

```sql
-- 006_fix_role_default.sql
ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'viewer';
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'viewer'));

-- Profile creation moves to a trigger; clients must never insert their own row.
DROP POLICY IF EXISTS "Users insert own profile" ON public.profiles;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $func$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (NEW.id, NEW.email, 'viewer')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$func$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

**Tasks:**

- [ ] Write and apply the migration above
- [ ] Verify the existing admin profile row still reads `role = 'admin'` (a default change is not retroactive)
- [ ] Delete the client-side `upsert` block at `app/login/page.tsx:43-46` entirely — the trigger owns this now
- [ ] Document the promotion step in `README.md`: `UPDATE public.profiles SET role = 'admin' WHERE email = '...';`

**Acceptance criteria:**

- A user created via invite lands with `role = 'viewer'` and is refused at `/dashboard`
- A direct `INSERT` into `profiles` from an authenticated client is rejected by RLS
- The existing admin is unaffected

---

## Phase 1 — Move authorization into the database

**Objective:** Stop relying on middleware as the only thing standing between a signed-in non-admin and the data.

### 1.1 Make RLS admin-aware

**Migration:** `supabase/migrations/007_admin_rls.sql`

**Current problem:** every `trends` policy is `USING (auth.role() = 'authenticated')`, including `FOR DELETE`. Any authenticated non-admin can read and **delete all 22 rows** straight through the REST API without ever loading the app. The admin gate exists only in `middleware.ts`.

```sql
-- 007_admin_rls.sql
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = ''
AS $func$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  );
$func$;

DROP POLICY IF EXISTS "Authenticated read trends"   ON public.trends;
DROP POLICY IF EXISTS "Authenticated insert trends" ON public.trends;
DROP POLICY IF EXISTS "Authenticated delete trends" ON public.trends;

CREATE POLICY "Admins read trends"   ON public.trends FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins insert trends" ON public.trends FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "Admins delete trends" ON public.trends FOR DELETE USING (public.is_admin());

DROP POLICY IF EXISTS "Authenticated read knowledge_base" ON public.knowledge_base;
CREATE POLICY "Admins read knowledge_base" ON public.knowledge_base
  FOR SELECT USING (public.is_admin());
```

**Tasks:**

- [ ] Write and apply the migration
- [ ] Re-run the Supabase security advisor and confirm no new findings

**Acceptance criteria:**

- A `viewer`-role JWT hitting `/rest/v1/trends` directly gets an empty result on `SELECT` and 0 rows affected on `DELETE`
- The admin account still sees History and can delete its own searches

### 1.2 Seed the knowledge base

**File:** `supabase/migrations/004_knowledge_base.sql`

**Current problem:** the table has 0 rows in production, so `searchKnowledgeBase()` returns `""` on every query and the AI Analyst silently loses its grounding context.

**Tasks:**

- [ ] Re-run the seed portion of migration 004 against production
- [ ] Confirm `SELECT count(*) FROM knowledge_base` is non-zero
- [ ] Log a warning in `app/api/agent/route.ts` when a KB search returns empty, so this fails loudly next time

**Acceptance criteria:**

- An agent question about sourcing cites knowledge-base content

---

## Phase 2 — Auth-flow correctness

**Objective:** Fix the routing layer so sessions survive, redirects cannot be hijacked, and the file convention is current.

### 2.1 Migrate `middleware.ts` to `proxy.ts`

**Files:** `middleware.ts` → `proxy.ts`

**Current problem:** Next.js 16.2.7 warns on every boot that the `middleware` file convention is deprecated. Reference: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`.

**Tasks:**

- [ ] Rename the file to `proxy.ts` at the project root
- [ ] Rename the exported function `middleware` to `proxy`
- [ ] Keep the exported `config` object as-is (subject to 2.3)
- [ ] Confirm the deprecation warning is gone from `npm run dev` and `npm run build`

**Acceptance criteria:**

- Build output still lists `ƒ Proxy (Middleware)` and route protection is unchanged

### 2.2 Stop dropping refreshed session cookies on redirect

**File:** `proxy.ts` (lines 15 and 26, plus both redirect paths)

**Current problem:** Supabase's `setAll` writes refreshed tokens onto `res`, but the unauthenticated and non-admin branches return a brand-new `NextResponse.redirect(...)`. Those cookies are discarded, so a user whose token was mid-refresh is bounced to `/login` despite holding a valid session.

**Tasks:**

- [ ] Build the redirect response, then copy every cookie from `res` onto it before returning
- [ ] Apply the same fix to the 401/403 JSON responses on the API paths

**Acceptance criteria:**

- Forcing a token refresh (wait past expiry, then navigate) keeps the user signed in rather than redirecting to `/login`

### 2.3 Exclude the Sentry tunnel and API paths from the matcher

**Files:** `proxy.ts`, `next.config.ts`

**Current problem:** `next.config.ts` sets `tunnelRoute: "/monitoring"`, but the matcher `/((?!_next/static|_next/image|favicon.ico).*)` catches it. Unauthenticated error reports are 307'd to `/login`, so login-page errors — exactly the ones you need — never reach Sentry.

**Tasks:**

- [ ] Add `monitoring` and `api` to the negative lookahead, keeping the two explicit `/api/trends` and `/api/agent` matcher entries
- [ ] Verify `POST /monitoring` from a logged-out browser returns 2xx, not a redirect

**Acceptance criteria:**

- An error thrown on `/login` while signed out appears in Sentry

### 2.4 Close the open redirect

**File:** `app/login/page.tsx` (lines 11, 23, 48)

**Current problem:** `redirectTo` is read raw from the query string and passed to `router.replace()`. `/login?redirectTo=https://evil.com` sends the user off-site immediately after a successful sign-in.

```ts
function safeRedirect(path: string | null): string {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return "/dashboard";
  return path;
}
```

**Tasks:**

- [ ] Add the guard above and route both `router.replace()` call sites through it
- [ ] Add `router.refresh()` after the redirect so server components pick up the new session

**Acceptance criteria:**

- `/login?redirectTo=https://example.com` and `/login?redirectTo=//example.com` both land on `/dashboard`
- `/login?redirectTo=/history` still honours the intended destination

### 2.5 Move the role check out of the request path (optional, recommended)

**Files:** `proxy.ts`, Supabase custom access-token hook

**Current problem:** `middleware.ts:46-51` runs a `profiles` query on every page and API request.

**Tasks:**

- [ ] Add the role to `app_metadata` via a Supabase custom access-token hook
- [ ] Read the claim from the session in `proxy.ts` instead of querying
- [ ] Keep the DB query in `getAdminUser()` as the authoritative server-side check

**Acceptance criteria:**

- No `profiles` query appears in Supabase logs during ordinary navigation

---

## Phase 3 — Login UX, accessibility, and password recovery

**Objective:** Make the one screen every user touches work properly. **No signup page is to be built** — see the rationale below.

### 3.1 Invite-only account creation

**Location:** Supabase Dashboard → Authentication → Users → Invite, or `auth.admin.inviteUserByEmail` server-side

**Rationale:** self-serve signup is pure attack surface for an internal tool, and the schema cannot support it anyway — `trends` has no `user_id` column, so there is no way to scope rows per user. Opening signup would require per-tenant ownership columns and a full RLS rewrite first. `IMPLEMENTATION_PUBLIC_DEPLOYMENT.md:31` already records the admin-only decision.

**Tasks:**

- [ ] Document the invite flow in `README.md`
- [ ] Confirm the invitee sets their own password via the emailed link (no password ever handled by an operator)
- [ ] Promote approved users with the SQL from 0.4

### 3.2 Password recovery pages

**New files:** `app/forgot-password/page.tsx`, `app/update-password/page.tsx`

**Current problem:** there is no reset path at all. A locked-out admin has no self-service recovery, and this is the only auth screen actually worth adding.

**Tasks:**

- [ ] `/forgot-password` — email field calling `supabase.auth.resetPasswordForEmail(email, { redirectTo })`
- [ ] `/update-password` — new-password field calling `supabase.auth.updateUser({ password })`
- [ ] Add both to `PUBLIC_PATHS` in `proxy.ts`
- [ ] Add the redirect URL to Supabase → Authentication → URL Configuration
- [ ] Link "Forgot password?" from the login card
- [ ] Return the same neutral confirmation whether or not the email exists (no account enumeration)

**Acceptance criteria:**

- A full reset round-trip works end to end on the deployed URL

### 3.3 Login form fixes

**File:** `app/login/page.tsx`

**Tasks:**

- [ ] Gate the render on the `getUser()` check (lines 21-25) — a signed-in user currently sees the whole form flash before it redirects
- [ ] Trim and lowercase the email before submitting
- [ ] Clear the error banner when either field changes
- [ ] Add a show/hide password toggle and `autoFocus` on the email field
- [ ] Map raw Supabase error strings to friendly copy
- [ ] Surface a real error if the profile lookup fails, instead of the silent `/login?error=unauthorized` loop

### 3.4 Accessibility

**File:** `app/login/page.tsx` (lines 74 and 83)

**Current problem:** the `<label>` elements have no `htmlFor` and do not wrap their inputs. Chrome's accessibility tree names both fields by their *placeholder* — "admin@example.com" and the password dots — not "Email" and "Password".

**Tasks:**

- [ ] Add `id` / `htmlFor` pairs to both fields
- [ ] Add `autoComplete="username"` and `autoComplete="current-password"`
- [ ] Add `role="alert"` to the error banner, plus `aria-invalid` and `aria-describedby` on the inputs
- [ ] Add `aria-busy` to the submit button while loading

**Acceptance criteria:**

- The accessibility tree names the fields "Email" and "Password"
- A password manager offers to fill and save credentials without heuristics

### 3.5 Fix autofill styling in dark mode

**File:** `app/globals.css`

**Current problem:** Chrome's `:-webkit-autofill` background overrides the Tailwind classes — autofilled fields render pale lavender against the dark card. Nothing in `globals.css` addresses it.

**Tasks:**

- [ ] Add an `input:-webkit-autofill` rule using `box-shadow: inset 0 0 0 1000px var(--t-elevated)` and `-webkit-text-fill-color: var(--t-text)`
- [ ] Verify in both light and dark themes

---

## Phase 4 — Production polish & observability

### 4.1 Durable rate limiting

**Files:** `app/api/trends/route.ts`, `app/api/agent/route.ts`

**Current problem:** both routes keep counters in a module-level `Map`. On a serverless host this resets on every cold start and is not shared across instances — close to no limit at all, in front of two metered APIs.

**Tasks:**

- [ ] Move to Upstash Redis or a Postgres counter table keyed by `user_id`
- [ ] Keep the existing limits (30 trends/hr, 60 agent messages/hr) and the `Retry-After` header
- [ ] Log rate-limit hits to Sentry as warnings

### 4.2 Sentry sampling and billing guards

**Files:** `sentry.client.config.ts`, `sentry.server.config.ts`

**Tasks:**

- [ ] Reduce `tracesSampleRate` from `1.0` to `0.1`
- [ ] Set hard spend caps and billing alerts on SerpAPI and OpenAI
- [ ] Confirm session replay masking is on for the login route

### 4.3 Deployment hygiene

**Tasks:**

- [ ] Set every variable from 0.2 in the hosting provider's environment, not just `.env`
- [ ] Confirm `SUPABASE_SERVICE_ROLE_KEY` is **not** prefixed `NEXT_PUBLIC_` anywhere
- [ ] Re-run `npm run build` and confirm a clean pass with no deprecation warnings
- [ ] Grep the client bundle for the service-role key as a final check

---

## Go-live checklist

Everything below must be true before the public URL is announced:

- [ ] 0.1 — `/auth/v1/settings` returns `200`; a real sign-in reaches `/dashboard`
- [ ] 0.2 — all four env names corrected; trends chart and AI Analyst both return real data
- [ ] 0.3 — `disable_signup: true`; leaked-password protection enabled
- [ ] 0.4 — `role` defaults to `'viewer'`; trigger creates profiles; client upsert deleted
- [ ] 1.1 — `trends` and `knowledge_base` policies require `public.is_admin()`
- [ ] 2.1 — `proxy.ts` in place, no deprecation warning
- [ ] 2.2 — session survives a token refresh across a redirect
- [ ] 2.3 — Sentry receives an error thrown while signed out
- [ ] 2.4 — external `redirectTo` values are rejected
- [ ] Supabase security advisor reports zero findings
- [ ] `npm run build` passes clean

---

## Suggested order of work

```
Phase 0  (1-2h)  ──▶  login works at all, project stops issuing admin accounts
   │
Phase 1  (0.5d)  ──▶  database enforces admin-only, independent of app code
   │
Phase 2  (0.5d)  ──▶  proxy rename + cookie fix + redirect guard   ◀── one commit
   │
   ├──▶  DEPLOYABLE HERE
   │
Phase 3  (1d)    ──▶  password recovery, a11y, login polish
   │
Phase 4  (0.5d)  ──▶  durable rate limits, Sentry tuning, spend caps
```

Phases 0 and 1 touch the live database — apply each migration to a Supabase branch first if you want a dry run. Phases 3 and 4 are safe to ship after launch.
