# E-Commerce Product Trends Dashboard

An admin-only internal tool for e-commerce product research powered by Google Trends, Supabase, and OpenAI.

**Features:** Trend charts · Region interest maps · Related queries · AI Research Analyst agent · Trend classification (Evergreen / Seasonal / etc.) · 3 themes × 2 modes · Keyword comparison · Search history

> **Access model:** invite-only. There is no signup page and one is not planned — see
> [Account management](#account-management). Only users with `role = 'admin'` can reach any page or API route.

---

## Local development

```bash
# 1. Clone
git clone https://github.com/Yakhmedia/e-com_trends_product_research.git
cd e-com_trends_product_research

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env
# Fill in every value in .env

# 4. Run migrations in the Supabase SQL editor (in order):
#    supabase/migrations/001_create_trends.sql
#    supabase/migrations/002_profiles.sql
#    supabase/migrations/003_add_date_range.sql
#    supabase/migrations/004_knowledge_base.sql
#    supabase/migrations/005_production_rls.sql
#    supabase/migrations/006_fix_role_default.sql
#    supabase/migrations/007_admin_rls.sql
#    supabase/migrations/008_access_token_hook.sql
#    supabase/migrations/009_rate_limits.sql
#    supabase/migrations/010_harden_functions.sql

# 5. Create your first user via Authentication → Users → Invite,
#    then promote them (see "Account management" below)

# 6. Start dev server
npm run dev
```

`NEXT_PUBLIC_*` values are inlined at build time — restart the dev server after changing them.

---

## Environment variables

Only `NEXT_PUBLIC_` is special in Next.js. A `NEXT_`-prefixed name is **not** exposed to
the server as you might expect — it simply reads back `undefined`. Use these names exactly.

| Variable | Server/Client | Notes |
|----------|---------------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Client | Bare origin only — no `/rest/v1`, no trailing slash. supabase-js appends its own paths. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client | Safe to ship in the bundle. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server | Bypasses RLS. Never prefix `NEXT_PUBLIC_`. **Required in production** — the app throws on boot without it. |
| `SERP_API_KEY` | Server | From serpapi.com. |
| `OPENAI_API_KEY` | Server | From platform.openai.com. |
| `NEXT_PUBLIC_SENTRY_DSN` | Client | Optional but recommended. |

---

## Account management

Account creation is invite-only and roles are granted in SQL. This is deliberate: the
`trends` table has no `user_id` column, so there is no way to scope rows per user.
Opening signup would require per-tenant ownership columns and an RLS rewrite first.

**Invite a user** — Supabase Dashboard → Authentication → Users → Invite, or
`auth.admin.inviteUserByEmail()` server-side. The invitee sets their own password via the
emailed link; no operator ever handles a password.

New users land as `role = 'viewer'` (created by the `on_auth_user_created` trigger) and are
refused at every route. **Promote them explicitly:**

```sql
UPDATE public.profiles SET role = 'admin' WHERE email = 'them@example.com';
```

To revoke access, set the role back to `'viewer'` (or delete the auth user). Note that if
the access-token hook is enabled, an existing session keeps its old `role` claim until the
token refreshes — delete the user to cut access immediately.

**Password reset** is self-service at `/forgot-password` → emailed link → `/update-password`.

---

## Deploy to Vercel

1. Push to GitHub
2. Import repo at [vercel.com](https://vercel.com)
3. Set every variable from the table above in the Vercel dashboard — not just in `.env`
4. Deploy

---

## Supabase production checklist

Manual dashboard steps, none of which can be done from SQL:

- [ ] **Disable public email signups** — Authentication → Providers → Email → turn off
      "Enable email signups". The anon key ships in the client bundle by design, so an
      open signup endpoint means anyone can create an account by calling the auth API
      directly, without ever loading the app.
- [ ] **Enable leaked-password protection** — Authentication → Policies. Clears the
      standing security-advisor warning.
- [ ] **Enable the access-token hook** — Authentication → Hooks → Customize Access Token
      (JWT) Claims → select `public.custom_access_token_hook`. Optional: without it the
      proxy falls back to a `profiles` query on every request, which still works.
- [ ] **Set the Site URL and redirect URLs** — Authentication → URL Configuration. Add
      `https://<your-domain>/update-password` so password-reset links resolve.
- [ ] Run all ten migrations in order
- [ ] Verify RLS is enabled on all tables and the security advisor is clean
- [ ] Set spend caps and billing alerts on SerpAPI and OpenAI

---

## Security model

- **Authorization lives in the database.** `trends` and `knowledge_base` policies call
  `private.is_admin()`; a non-admin JWT hitting PostgREST directly reads zero rows and
  deletes zero rows. `proxy.ts` is a convenience layer, not the boundary.
- `private.is_admin()` sits outside the `public` schema so PostgREST does not expose it
  as an RPC endpoint.
- Profile rows are created by a trigger and default to `'viewer'`; clients have no INSERT
  policy on `profiles` and cannot self-assign a role.
- Rate limits (30 trends/hr, 60 agent messages/hr per user) are counted in
  `public.rate_limits` via an atomic RPC, so they survive cold starts and are shared
  across instances.

---

## Stack

- **Next.js 16** (App Router, Turbopack) — routing interception lives in `proxy.ts`
  (the `middleware.ts` convention is deprecated in this version)
- **TypeScript** · **Tailwind CSS v4**
- **Supabase** (Postgres + Auth + RLS)
- **SerpAPI** (Google Trends)
- **OpenAI GPT-4o mini**
- **Recharts** · **Sentry**
