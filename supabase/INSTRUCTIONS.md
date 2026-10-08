# Supabase project setup for SK Tapri

## 1. Create a Supabase project
- Sign in at https://supabase.com with the team account you want to own the project.
- Create a new project, choose a region close to your users, set a strong database
  password, and wait for the project to be ready.

## 2. Add environment variables locally
Copy `supabase/env.example` to `supabase/env.local` and fill in the values from
your project settings:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Then run:
- `cp supabase/env.local .env.local` for local dev, **or**
- paste the same keys into the Freebuff Cloud environment UI if you want the
  preview to use them.

Never commit real keys. `supabase/env.local` and `.env.local` are ignored.

## 3. Auth settings
- Enable Email/Password provider in Auth > Providers.
- Turn off "Confirm email" only if you want immediate login during initial setup;
  otherwise keep it on and use the provided confirmation flow.
- For this app, branch users are created with synthetic emails such as
  `kaza@sktapri.app`. Admin is `admin@sktapri.app`.

## 4. Run migrations
- Open the Supabase SQL Editor.
- Run the migrations in `supabase/migrations/` in filename order.
- Run the seed in `supabase/seed.sql` if you want sample branches and admin.

## 5. Verify row-level security
- After migrations, check that RLS is enabled on every table used by the app.
- Confirm the policies match the file comments and the project spec.
- Test with both a branch user and an admin user.

## 6. Service role key
- The service-role key is stored server-side only.
- Use it only in server-only code paths such as the admin branch-user creation
  route.
- Do not expose it to the browser or to client components.
