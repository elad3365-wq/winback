# WinBack

WinBack helps local service businesses recover lost revenue from customers who
received an estimate and never replied.

This repository contains **Phase 1** only: authentication, one business per
user, and lead tracking. No SMS, AI, billing or third-party integrations yet.

## Stack

- Next.js 16 (App Router) + TypeScript
- Tailwind CSS v4
- Supabase (Postgres, Auth, Row Level Security)

## Getting started

1. **Create a Supabase project** at [supabase.com](https://supabase.com).

2. **Run the migrations.** In the Supabase dashboard open the SQL Editor and run
   the files in `supabase/migrations/` in order:

   | File | What it does |
   | --- | --- |
   | `0001_schema.sql` | Creates `profiles`, `businesses`, `business_members`, `leads` and the `lead_status` enum |
   | `0002_rls.sql` | Enables Row Level Security and adds the per-business policies |
   | `0003_triggers.sql` | Gives every new signup a profile, a business and an owner membership |

3. **Set environment variables.** Copy `.env.example` to `.env.local` and fill in
   the values from Project Settings → API:

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<your-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon / publishable key>
   NEXT_PUBLIC_SITE_URL=http://localhost:3000
   ```

   The service role key is deliberately absent — it is never used by this app.

4. **Run it.**

   ```bash
   npm install
   npm run dev
   ```

## Project layout

```
src/
  app/
    (auth)/            sign up, login, and the auth server actions
    (app)/             authenticated shell, dashboard, leads
    auth/confirm/      landing route for the signup confirmation email
  components/
    ui/                buttons, fields, cards, modal, badges
    auth/              login and signup forms
    leads/             leads table and the add/edit form
  lib/
    supabase/          browser, server and proxy Supabase clients
    business.ts        resolves the signed-in user's business
    leads.ts           lead statuses and the dashboard stat calculations
supabase/migrations/   SQL to run against your Supabase project
```

## How the data is secured

Every table has RLS enabled. Access to `leads` and `businesses` is granted
through `business_members`, checked by the `is_business_member()` /
`is_business_owner()` SECURITY DEFINER functions, so a user can only ever read
or write rows belonging to their own business. The browser only ever receives
the anon key, which carries no privileges of its own.

## Dashboard metrics

| Metric | Definition |
| --- | --- |
| Total Leads | Every lead belonging to the business |
| Active Follow-ups | Leads with status *Follow-up needed*, *Contacted* or *Interested* |
| Recovered Customers | Leads with status *Recovered* |
| Recovered Revenue | Sum of `estimate_amount` across leads with status *Recovered* |

## Scripts

```bash
npm run dev     # start the dev server
npm run build   # production build
npm run lint    # eslint
```
