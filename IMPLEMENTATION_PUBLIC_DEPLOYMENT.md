# Implementation Plan: Public Deployment

**Project:** Product Trends Dashboard (AI-Ecommerce)  
**Goal:** Make the app safe to deploy on the public internet as an **admin-only internal tool**  
**Status:** Pre-production — security and configuration gaps must be closed first  
**Last updated:** 2026-06-08

---

## Executive summary

The application builds successfully and the UI is feature-complete, but it is **not safe to expose publicly today**. Page-level auth exists via middleware, yet API routes are unauthenticated, database policies are inconsistent with server code, and every login auto-assigns the `admin` role.

This plan closes those gaps in four phases. **Phases 1–2 are mandatory before any public URL goes live.** Phases 3–4 are strongly recommended for a stable production operation.

| Phase | Focus | Effort (est.) | Blocker? |
|-------|-------|---------------|----------|
| 1 | API security & auth hardening | 1–2 days | Yes |
| 2 | Database RLS & server Supabase client | 1 day | Yes |
| 3 | Deployment config & documentation | 0.5 day | Yes |
| 4 | Production polish & observability | 1–2 days | Recommended |

---

## Prerequisites (before starting)

- [ ] Supabase project created (production, separate from dev if possible)
- [ ] SerpAPI account with billing alerts enabled
- [ ] OpenAI account with usage limits / billing alerts enabled
- [ ] Hosting target chosen (Vercel recommended for Next.js)
- [ ] Decision recorded: **admin-only tool** — no public signup, no consumer-facing access

---

## Phase 1 — API security & auth hardening

**Objective:** Ensure every paid or sensitive endpoint requires an authenticated admin session. Remove dev-only surfaces.

### 1.1 Protect API routes in middleware

**File:** `middleware.ts`

**Current problem:** Matcher excludes all `/api/*` paths, so `/api/trends`, `/api/agent`, and `/api/debug` are publicly callable.

**Tasks:**

- [ ] Update `config.matcher` to include API routes that must be protected:
  - `/api/trends`
  - `/api/agent`
- [ ] Keep `/api/debug` out of production entirely (see 1.2) rather than protecting it
- [ ] For matched API routes, return `401 JSON` instead of redirecting to `/login` when unauthenticated
- [ ] Reuse the existing admin `profiles.role` check; return `403 JSON` for authenticated non-admins
- [ ] Verify session cookie refresh still works for API requests (existing `setAll` cookie handling)

**Acceptance criteria:**

- Unauthenticated `GET /api/trends?keyword=test` → `401`
- Authenticated non-admin → `403`
- Authenticated admin → `200` with data

### 1.2 Add server-side auth guard in each API route

**Files:** `app/api/trends/route.ts`, `app/api/agent/route.ts`

**Current problem:** `getAdminUser()` in `lib/auth.ts` exists but is never called.

**Tasks:**

- [ ] At the top of each route handler, call `getAdminUser()`
- [ ] Return `401` if no user, `403` if not admin
- [ ] This is defense-in-depth even after middleware changes

**Acceptance criteria:**

- Removing middleware protection in a test environment still leaves routes guarded at the handler level

### 1.3 Remove or gate `/api/debug`

**File:** `app/api/debug/route.ts`

**Tasks (choose one):**

- **Option A (recommended):** Delete `app/api/debug/route.ts` before production deploy
- **Option B:** Guard with `getAdminUser()` and only enable when `process.env.NODE_ENV === "development"`

**Acceptance criteria:**

- Production build has no unauthenticated raw SerpAPI proxy

### 1.4 Fix admin role assignment on login

**File:** `app/login/page.tsx`

**Current problem:** Every login upserts `role: "admin"` client-side. Any user who can authenticate becomes admin.

**Tasks:**

- [ ] Remove `role: "admin"` from the client-side `upsert`
- [ ] On first login, upsert only `id` and `email` (or remove upsert entirely)
- [ ] Create a Supabase trigger or one-time admin script to assign `role = 'admin'` only for approved users (see Phase 2.4)
- [ ] Add server-side validation: middleware already checks role; ensure no code path can self-promote

**Acceptance criteria:**

- New user with default `role` (or no profile) cannot access dashboard
- Only users explicitly granted `admin` in the database can access the app

### 1.5 Disable public signup in Supabase

**Location:** Supabase Dashboard → Authentication → Providers → Email

**Tasks:**

- [ ] Disable "Enable email signups" (or restrict to invite-only)
- [ ] Create initial admin user(s) manually in Supabase Auth
- [ ] Set strong passwords; store credentials in a password manager

**Acceptance criteria:**

- Random visitors cannot create accounts

### 1.6 Add basic rate limiting

**Files:** `app/api/trends/route.ts`, `app/api/agent/route.ts`

**Tasks:**

- [ ] Add per-user rate limits (e.g. 30 trends searches / hour, 60 agent messages / hour)
- [ ] Implementation options (pick one):
  - **Vercel KV / Upstash Redis** — recommended for serverless
  - In-memory Map — acceptable only for single-instance dev
- [ ] Return `429 Too Many Requests` with `Retry-After` header when exceeded
- [ ] Log rate-limit hits for monitoring

**Acceptance criteria:**

- Rapid repeated calls from one session are throttled
- Legitimate single-user usage is unaffected

---

## Phase 2 — Database RLS & server Supabase client

**Objective:** Align Supabase policies with how the app reads and writes data. Fix broken features (cache, knowledge base, history delete).

### 2.1 New migration: tighten RLS policies

**File:** `supabase/migrations/005_production_rls.sql` (new)

**Tasks:**

- [ ] Drop `"Allow public insert"` on `trends` (left over from `001_create_trends.sql`)
- [ ] Add authenticated read policy (already in `002_profiles.sql` — verify it exists in production)
- [ ] Add authenticated insert policy on `trends`:
  ```sql
  CREATE POLICY "Authenticated insert trends" ON trends
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  ```
- [ ] Add authenticated delete policy on `trends` (fixes History page delete):
  ```sql
  CREATE POLICY "Authenticated delete trends" ON trends
    FOR DELETE USING (auth.role() = 'authenticated');
  ```
- [ ] Prevent clients from setting arbitrary `role` on `profiles`:
  ```sql
  -- Revoke direct role updates from clients; only service role / trigger may set role
  CREATE POLICY "Users update own profile (no role change)" ON profiles
    FOR UPDATE USING (auth.uid() = id)
    WITH CHECK (role = (SELECT role FROM profiles WHERE id = auth.uid()));
  ```
  Or use a trigger that rejects `role` changes unless `auth.jwt() ->> 'role' = 'service_role'`.
- [ ] Verify `knowledge_base` SELECT policy requires `authenticated` (already in `004_knowledge_base.sql`)

**Acceptance criteria:**

- Anonymous direct Supabase API calls cannot insert into `trends`
- Authenticated admin can read, insert, and delete trends from the browser client (History page)
- Clients cannot escalate their own `profiles.role`

### 2.2 Replace anon server client with authenticated server client

**Files:** `lib/supabase.ts`, `app/api/trends/route.ts`, `app/api/agent/route.ts`

**Current problem:** `lib/supabase.ts` uses the anon key with no user session. RLS blocks reads on `trends` and `knowledge_base` for this client.

**Tasks:**

- [ ] Create `lib/supabase-server.ts` using `createSupabaseServerClient()` from `lib/auth.ts` (cookie-based, carries user session)
- [ ] Update API routes to use the authenticated server client instead of `lib/supabase.ts`
- [ ] Keep `lib/supabase-browser.ts` for client components (History, login)
- [ ] Deprecate or restrict `lib/supabase.ts` — if service-role access is needed for cache writes, create `lib/supabase-admin.ts` that:
  - Uses `SUPABASE_SERVICE_ROLE_KEY` (server-only env var, never `NEXT_PUBLIC_`)
  - Is only imported in API route handlers after `getAdminUser()` passes
  - Is never imported in client components

**Decision matrix:**

| Operation | Client | Why |
|-----------|--------|-----|
| Trends cache read/write in API | Authenticated server client OR service-role admin client | RLS + reliability |
| Knowledge base search in agent API | Authenticated server client | Policy requires `authenticated` |
| History list/delete | Browser client (existing) | User session already present |
| Login upsert profile | Browser client | User session present; no role field |

**Acceptance criteria:**

- Trends cache hits work in production (no silent fallback to SerpAPI every request)
- AI agent receives knowledge-base context in responses
- `SUPABASE_SERVICE_ROLE_KEY` is never exposed to the browser

### 2.3 Assign admin roles via database, not application code

**Tasks:**

- [ ] After creating admin user(s) in Supabase Auth, run in SQL editor:
  ```sql
  INSERT INTO profiles (id, email, role)
  VALUES ('<auth-user-uuid>', 'admin@yourdomain.com', 'admin')
  ON CONFLICT (id) DO UPDATE SET role = 'admin';
  ```
- [ ] Optional: Supabase trigger on `auth.users` insert that creates profile with `role = 'user'` by default
- [ ] Document the manual admin-promotion step in README

**Acceptance criteria:**

- Admin access is granted only by explicit database action or service-role script

### 2.4 Run all migrations on production Supabase

**Order:**

1. `001_create_trends.sql`
2. `002_profiles.sql`
3. `003_add_date_range.sql`
4. `004_knowledge_base.sql`
5. `005_production_rls.sql` (new)

**Tasks:**

- [ ] Apply migrations in order in the production Supabase SQL editor
- [ ] Verify policies with: `SELECT * FROM pg_policies WHERE tablename IN ('trends', 'profiles', 'knowledge_base');`
- [ ] Seed knowledge base (included in `004_knowledge_base.sql`)

**Acceptance criteria:**

- All tables, indexes, policies, and seed data exist in production

### 2.5 Resolve or remove duplicate Edge Function

**File:** `supabase/functions/fetch-trends/index.ts`

**Current problem:** Open CORS, no auth, duplicates `/api/trends`.

**Tasks (choose one):**

- **Option A (recommended):** Do not deploy the Edge Function; use Next.js API only
- **Option B:** Deploy with JWT verification and restrict CORS to your production domain

**Acceptance criteria:**

- No unauthenticated public endpoint duplicates trends fetching

---

## Phase 3 — Deployment config & documentation

**Objective:** Make deployment repeatable and env vars explicit.

### 3.1 Create `.env.example`

**File:** `.env.example` (new)

```env
# Supabase (required)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Server-only (required for API routes)
SERP_API_KEY=your-serpapi-key
OPENAI_API_KEY=your-openai-key

# Server-only (optional — only if using service-role client for cache)
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

**Tasks:**

- [ ] Create `.env.example` with comments for each variable
- [ ] Confirm `.env.local` remains gitignored

### 3.2 Update README with deployment guide

**File:** `README.md`

**Tasks:**

- [ ] Replace boilerplate with project description
- [ ] Add local dev setup (clone, `npm install`, copy `.env.example` → `.env.local`, `npm run dev`)
- [ ] Add Supabase setup steps (migrations, admin user creation)
- [ ] Add Vercel deploy steps (connect repo, set env vars, deploy)
- [ ] Add post-deploy smoke test checklist (see Section 5 below)
- [ ] Rename package from `temp-app` to a production name in `package.json`

### 3.3 Configure hosting environment variables

**Platform:** Vercel (or chosen host)

| Variable | Scope | Required |
|----------|-------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Production, Preview | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production, Preview | Yes |
| `SERP_API_KEY` | Production, Preview | Yes |
| `OPENAI_API_KEY` | Production, Preview | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Production only | If using admin client |

**Tasks:**

- [ ] Set all required env vars in hosting dashboard
- [ ] Do **not** set preview deployments to use production Supabase unless intentional
- [ ] Enable Vercel deployment protection for preview URLs (optional)

### 3.4 Supabase production settings

**Tasks:**

- [ ] Set Site URL to production domain (e.g. `https://trends.yourdomain.com`)
- [ ] Add redirect URLs for auth callbacks
- [ ] Enable RLS on all tables (verify)
- [ ] Review Auth email templates if using email flows

### 3.5 Domain & HTTPS

**Tasks:**

- [ ] Attach custom domain in Vercel
- [ ] Verify HTTPS is enforced (automatic on Vercel)
- [ ] Update Supabase Site URL to match final domain

---

## Phase 4 — Production polish & observability

**Objective:** Improve reliability, UX, and operational visibility. Not strict blockers, but strongly recommended before sharing the URL widely.

### 4.1 Error and loading states

**Tasks:**

- [ ] Add `app/error.tsx` — global error boundary with retry
- [ ] Add `app/not-found.tsx` — branded 404 page
- [ ] Add `app/loading.tsx` or per-route loading skeletons for dashboard/history/compare

### 4.2 Security headers

**File:** `next.config.ts`

**Tasks:**

- [ ] Add `headers()` config:
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy` (restrict camera, microphone, etc.)
- [ ] Consider CSP once inline scripts are reviewed (`app/layout.tsx` theme init script)

### 4.3 Input validation on API routes

**Files:** `app/api/trends/route.ts`, `app/api/agent/route.ts`

**Tasks:**

- [ ] Validate `keyword` length (e.g. max 100 chars, alphanumeric + spaces)
- [ ] Validate `date` param against an allowlist of SerpAPI date strings
- [ ] Validate `messages` array shape and max length in agent route
- [ ] Reject oversized request bodies

### 4.4 Cost monitoring & alerts

**Tasks:**

- [ ] SerpAPI: set monthly search limit / billing alert
- [ ] OpenAI: set monthly budget cap in platform settings
- [ ] Optional: log each SerpAPI and OpenAI call with user id and timestamp for audit

### 4.5 Middleware deprecation (Next.js 16)

**File:** `middleware.ts`

**Current warning:** `"middleware" file convention is deprecated. Please use "proxy" instead.`

**Tasks:**

- [ ] Read `node_modules/next/dist/docs/` guidance on proxy vs middleware for Next.js 16.2.7
- [ ] Plan migration to `proxy` convention when stable; not a launch blocker if middleware still works

### 4.6 CI/CD (optional)

**Tasks:**

- [ ] Commit all application files to git
- [ ] Add GitHub Actions: `npm run lint` + `npm run build` on PR
- [ ] Connect Vercel to repo for automatic deploys on merge to main

---

## Phase 5 — Post-deploy smoke tests

Run these after every production deploy:

| # | Test | Expected |
|---|------|----------|
| 1 | Visit `/dashboard` logged out | Redirect to `/login` |
| 2 | `curl /api/trends?keyword=test` (no cookies) | `401` |
| 3 | `curl /api/agent` POST (no cookies) | `401` |
| 4 | `/api/debug` | `404` or `401` (not raw SerpAPI data) |
| 5 | Login as non-admin user | Redirect with unauthorized error |
| 6 | Login as admin | Dashboard loads |
| 7 | Search a keyword | Trends data + charts render |
| 8 | Search same keyword within 6h | Response shows `cached: true` |
| 9 | Open AI agent, ask a question | Response includes trend-aware analysis |
| 10 | History page → delete a row | Row removed, no RLS error |
| 11 | Compare page | Multi-keyword chart works |
| 12 | Sign out | Redirect to login, protected routes blocked |

---

## File change summary

| File | Action |
|------|--------|
| `middleware.ts` | Include API routes; return JSON 401/403 |
| `app/api/trends/route.ts` | Add `getAdminUser()` guard; use authenticated server client |
| `app/api/agent/route.ts` | Add `getAdminUser()` guard; use authenticated server client |
| `app/api/debug/route.ts` | Delete or dev-only gate |
| `app/login/page.tsx` | Remove client-side `role: "admin"` upsert |
| `lib/auth.ts` | No change (already has `getAdminUser`) |
| `lib/supabase.ts` | Deprecate or restrict to service-role admin use |
| `lib/supabase-server.ts` | **New** — cookie-based server client for API routes |
| `lib/supabase-admin.ts` | **New (optional)** — service-role client for cache |
| `supabase/migrations/005_production_rls.sql` | **New** — production RLS hardening |
| `.env.example` | **New** |
| `README.md` | Deployment and setup documentation |
| `next.config.ts` | Security headers |
| `package.json` | Rename from `temp-app` |
| `app/error.tsx`, `app/not-found.tsx`, `app/loading.tsx` | **New** (Phase 4) |

---

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Unauthenticated API abuse | High (today) | High ($$) | Phase 1 |
| Any user becomes admin | High (today) | Critical | Phase 1.4 + 2.3 |
| SerpAPI cost overrun | Medium | High | Rate limits + billing alerts |
| OpenAI cost overrun | Medium | Medium | Rate limits + budget cap |
| Cache not working (anon client) | High (today) | Medium | Phase 2.2 |
| KB context missing in agent | High (today) | Low | Phase 2.2 |
| History delete broken | High (today) | Low | Phase 2.1 |

---

## Recommended implementation order

```
Week 1 (blockers)
├── 1.1–1.3  API protection + remove debug
├── 1.4–1.5  Fix admin assignment + disable signup
├── 2.1        New RLS migration
├── 2.2        Authenticated server Supabase client
├── 2.3–2.4    Admin users + run migrations
└── 3.1–3.5    Env docs + deploy to staging

Week 2 (hardening)
├── 1.6        Rate limiting
├── 2.5        Edge function decision
├── 4.1–4.3    Error pages, headers, validation
├── 4.4        Cost alerts
└── Phase 5    Full smoke test on production URL
```

---

## Definition of done

The app is ready for public deployment when **all** of the following are true:

- [ ] All Phase 1 tasks complete
- [ ] All Phase 2 tasks complete
- [ ] All Phase 3 tasks complete
- [ ] Phase 5 smoke tests pass on production URL
- [ ] No secrets committed to git
- [ ] Billing alerts configured on SerpAPI and OpenAI
- [ ] At least one admin user created and verified manually

---

## Out of scope (for this plan)

- Converting to a multi-tenant SaaS with public user signup
- Role-based access beyond single `admin` role
- Automated test suite (can be added later)
- Mobile app or PWA
- Internationalization
