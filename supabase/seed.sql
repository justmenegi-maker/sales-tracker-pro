-- seed.sql
-- Sample branches and the profiles that make a login usable.
--
-- Run this in the Supabase SQL editor after migrations 001–007.
--
-- Every statement is idempotent, and the profile statements match the auth user
-- by email instead of using `auth.uid()`: the SQL editor has no JWT, so
-- `auth.uid()` is null there and the old version of this file failed with
-- "null value in column id violates not-null constraint" — which left the
-- branch logins without a profile, and a login without a profile cannot file a
-- daily report (row-level security refuses every read and write).
--
-- The auth users themselves must exist first: Authentication → Users → Add user
-- (or an invite). Then the `insert ... select` below links each one to its
-- branch. Profiles already linked are left alone.

-- ---------------------------------------------------------------------------
-- Branches
-- ---------------------------------------------------------------------------

insert into public.branches (id, name, is_active)
values
  (gen_random_uuid(), 'SK Spillow', true),
  (gen_random_uuid(), 'SK Kaza', true)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Profiles (one per auth user)
-- ---------------------------------------------------------------------------

-- Admin: `admin@sktapri.app`, no branch (it sees every branch).
insert into public.profiles (id, role, branch_id, display_name, is_active)
select
  u.id,
  'admin',
  null,
  'SK Tapri Admin',
  true
from auth.users u
where lower(u.email) = 'admin@sktapri.app'
  and not exists (select 1 from public.profiles p where p.id = u.id);

-- Branch staff: `spillow@sktapri.app` → SK Spillow.
insert into public.profiles (id, role, branch_id, display_name, is_active)
select
  u.id,
  'branch',
  b.id,
  b.name,
  true
from auth.users u
join public.branches b on lower(b.name) = 'sk spillow' and b.is_active
where lower(u.email) = 'spillow@sktapri.app'
  and not exists (select 1 from public.profiles p where p.id = u.id);

-- Branch staff: `kaza@sktapri.app` → SK Kaza.
insert into public.profiles (id, role, branch_id, display_name, is_active)
select
  u.id,
  'branch',
  b.id,
  b.name,
  true
from auth.users u
join public.branches b on lower(b.name) = 'sk kaza' and b.is_active
where lower(u.email) = 'kaza@sktapri.app'
  and not exists (select 1 from public.profiles p where p.id = u.id);

-- ---------------------------------------------------------------------------
-- Linking any other login (Google sign-in, a new invite, a branch change)
-- ---------------------------------------------------------------------------
-- The two helpers from migration 007 do the same thing by email and are safe to
-- re-run. Use these from the SQL editor after the auth user exists:
--
--   select public.link_branch_user('newbranch@sktapri.app', 'SK Kaza');
--   select public.link_admin_user('owner@sktapri.app');
--
-- A login with no profile, an inactive profile, or `role = 'branch'` with no
-- branch is refused by row-level security, so the app says which of those three
-- it is instead of showing a report form that can never be submitted.
