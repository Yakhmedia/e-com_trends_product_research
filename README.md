# E-Commerce Product Trends Dashboard

An admin-only internal tool for e-commerce product research powered by Google Trends, Supabase, and OpenAI.

**Features:** Trend charts · Region interest maps · Related queries · AI Research Analyst agent · Trend classification (Evergreen / Seasonal / etc.) · 3 themes × 2 modes · Keyword comparison · Search history

---

## Local development

```bash
# 1. Clone
git clone https://github.com/Yakhmedia/e-com_trends_product_research.git
cd e-com_trends_product_research

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env.local
# Fill in all values in .env.local

# 4. Run migrations in Supabase SQL editor (in order):
#    supabase/migrations/001_create_trends.sql
#    supabase/migrations/002_profiles.sql
#    supabase/migrations/003_add_date_range.sql
#    supabase/migrations/004_knowledge_base.sql
#    supabase/migrations/005_production_rls.sql

# 5. Create your admin user in Supabase Auth, then run in SQL editor:
#    INSERT INTO profiles (id, email, role)
#    VALUES ('<your-auth-user-uuid>', 'you@example.com', 'admin')
#    ON CONFLICT (id) DO UPDATE SET role = 'admin';

# 6. Start dev server
npm run dev
```

---

## Deploy to Vercel

1. Push to GitHub
2. Import repo at [vercel.com](https://vercel.com)
3. Set all environment variables from `.env.example` in the Vercel dashboard
4. Deploy

**Required env vars on Vercel:**

| Variable | Notes |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | From Supabase project settings |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | From Supabase project settings |
| `SUPABASE_SERVICE_ROLE_KEY` | From Supabase project settings — keep secret |
| `SERP_API_KEY` | From serpapi.com |
| `OPENAI_API_KEY` | From platform.openai.com |
| `NEXT_PUBLIC_SENTRY_DSN` | Optional — from sentry.io |

---

## Supabase production checklist

- [ ] Run all 5 migrations in order
- [ ] Set Site URL to your production domain
- [ ] Disable public email signups (Auth → Providers → Email)
- [ ] Create admin user manually; grant role via SQL (never via the app)
- [ ] Verify RLS is enabled on all tables

---

## Stack

- **Next.js 16** (App Router, Turbopack)
- **TypeScript** · **Tailwind CSS v4**
- **Supabase** (Postgres + Auth + RLS)
- **SerpAPI** (Google Trends)
- **OpenAI GPT-4o mini**
- **Recharts** · **Sentry**
