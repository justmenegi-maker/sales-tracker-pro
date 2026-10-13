## SK Tapri — Daily Sales Report

This repo is deployed on Vercel / Ulix preview:

- `https://fluffy-trout-xrpw55xxv6q72p9g9.github.dev/`

It connects to Supabase for auth and the sales data layer. The actual Supabase project URL, anon key, and service role key live in the workspace environment variables, not in this repo.

## Tech

- Next.js (App Router)
- React 19
- Supabase JS + SSR
- Tailwind v4
- Shadcn/ui primitives
- Recharts, sonner, Zod, date-fns

## Environment

Required env variables are configured in the hosted environment:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_TIMEZONE`
- `NEXT_PUBLIC_SITE_URL`

For local dev, use the workspace `.env.local` managed through Settings → Environment.

## Commands

- Install: `bun install`
- Dev: `bun run dev`
- Build: `bun run build`
- Test: `bun run test`

## Remote

Push target:

- `https://github.com/justmenegi-maker/sales-tracker-pro.git`
