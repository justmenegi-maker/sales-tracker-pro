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
- **Keep "Confirm email" on.** The app refuses to open a session for an
  unconfirmed address and offers a "resend confirmation email" action, but
  Supabase Auth is what blocks the password grant.
- Set a minimum password length and strength in Auth > Providers > Email to
  match `src/lib/password.ts` (12+ characters, mixed case, a number, a symbol),
  and turn on leaked-password protection if your plan includes it.
- Add only your own origins to Auth > URL Configuration; that allow list is what
  stops another site from using the project as a login redirect.

### Google sign-in

The app completes the OAuth return trip itself at `/auth/callback` (it is a
static export, so there is no server route for it).

1. In Google Cloud Console, create an OAuth client of type **Web application**.
   - Authorized redirect URI — **Supabase**, not this app:
     `https://<project-ref>.supabase.co/auth/v1/callback`
     (add your custom Supabase Auth domain too, if you use one).
   - Authorized JavaScript origin: your app's origin, for example
     `https://your-site.example`.
2. In Supabase, enable the Google provider (Authentication → Providers → Google)
   and paste the client ID and secret. Supabase asks for the
   `openid`, `userinfo.email` and `userinfo.profile` scopes.
3. In Auth → URL Configuration, set the Site URL to your production site and add
   the app callback URL to the allow list, for example
   `https://your-site.example/auth/callback`. Without it Supabase refuses the
   redirect and the app shows "Sign-in did not finish".
4. Keep the redirect path exactly `/auth/callback`: `src/lib/oauth.ts` builds the
   `redirectTo` value from the current origin plus that path, and only ever adds
   an internal `returnTo`.

A Google account only sees data once an admin has added it: sign-in succeeds,
but with no `profiles` row the app says "Account not linked yet" and row-level
security shows nothing. Link the address to a branch the same way as an invited
password user.
- For this app, branch users are created with synthetic emails such as
  `kaza@sktapri.app`. Admin is `admin@sktapri.app`.

## 4. Run migrations
- Open the Supabase SQL Editor.
- Run the migrations in `supabase/migrations/` in filename order.
- 004 adds read access to branch names for signed-in users, which the daily
  report form needs to label the branch.
- 005 adds the admin review columns (`review_status`, `review_note`,
  `reviewed_by`, `reviewed_at`) used by the tick-OK / flag-concern workflow.
  Until it is applied the app still loads reports and treats them all as
  unreviewed.
- 006 is the security pass (`SECURITY.md` explains each change): RLS re-enabled
  on every table, `anon` loses all table privileges, the `profiles` escalation
  path is closed, filed reports become append-only, columns get bounds, and
  per-user write rate limits are added.
- 007 lets trusted maintenance — the SQL editor, a migration, the service role —
  change a profile's role/branch again, and adds the `link_branch_user` /
  `link_admin_user` helpers. Without it the *next* step fails with
  "Only an admin can change role, branch or active state". Run it last.
- Run the seed in `supabase/seed.sql` if you want sample branches and admin.

### Link each login to a branch

A login with no `profiles` row, an inactive profile, or `role = 'branch'` with
no `branch_id` is refused by row-level security — it can open the app and read
or write nothing, so it cannot file a daily report at all. Linking is the step
that makes a branch login work:

1. Authentication → Users → **Add user** (or invite) for the branch email, for
   example `kaza@sktapri.app`.
2. In the SQL editor, point it at its branch:

   ```sql
   select public.link_branch_user('kaza@sktapri.app', 'SK Kaza');
   select public.link_admin_user('admin@sktapri.app');   -- admins have no branch
   ```

   Both functions are idempotent, report their own errors, and are `revoke`d
   from `anon`/`authenticated`, so they can only be called from the SQL editor
   or another trusted context — never from the browser.
3. The app says exactly which piece is missing when it is: "Account not linked
   yet" (no profile), "No branch linked to this login" (`role = 'branch'` with
   no branch), or "This login is switched off" (inactive profile).

## 5. Verify row-level security
- After migrations, check that RLS is enabled on every table used by the app.
- Confirm the policies match the file comments and the project spec.
- Test with both a branch user and an admin user: sign in as the branch, file a
  report, and check it appears in the admin overview (and that the other
  branch's reports never appear for the branch login).

## 6. Service role key
- The service-role key is stored server-side only. This app is a static export
  and has no server, so nothing in `src/` should ever read it — a server-only
  key belongs in a Supabase Edge Function.
- Never give it a `NEXT_PUBLIC_` prefix: everything with that prefix is bundled
  into the JavaScript shipped to visitors. `src/lib/supabase.ts` refuses to start
  if the configured browser key turns out to be a service-role key.
- `git status` should never show a `.env*` file: `.gitignore` covers them, and
  any value that was committed before must be rotated, since removing a file does
  not remove it from history.

## 7. Before the keys are set
The app runs in demo mode until `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` exist: two sample branches, three weeks of
reports and a debt ledger, kept in the browser's localStorage. Add the two keys
to the workspace environment and the same screens switch to live data with no
code change.
