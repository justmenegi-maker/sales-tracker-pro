-- 007_trusted_maintenance.sql
-- Links a branch login to its branch — the one step that was impossible.
--
-- Run this in the Supabase SQL editor after 001–006. Idempotent: re-running it
-- is safe.
--
-- The problem it fixes
-- -------------------
-- `guard_profile_update` (migration 006) refuses any update that moves a
-- profile's `role`, `branch_id` or `is_active` unless `public.is_admin()` is
-- true, and `is_admin()` reads `auth.uid()`. In the SQL editor (and for the
-- service role) there is no JWT, so `auth.uid()` is null and `is_admin()` is
-- false — which meant the *documented* way to link a new branch login
-- ("ask an admin to add your email to a branch") failed with
--
--   ERROR: Only an admin can change role, branch or active state
--
-- The branch login therefore stayed unlinked, and an unlinked login is refused
-- by every row-level security policy: it can open the app and read nothing, so
-- a branch could not file its daily report at all.
--
-- Every other guard in this repository already draws the line in the same
-- place: `enforce_write_rate_limit` returns early when `auth.uid()` is null and
-- says so in a comment. A request with no JWT is not a browser; it is trusted
-- maintenance (the SQL editor, a migration, the service role). They may already
-- read and write every row through RLS, so the trigger must not be the only
-- thing standing in their way.
--
-- What stays protected
-- --------------------
-- A *signed-in* caller is unaffected: a branch user still cannot rewrite their
-- own role, branch or active state, and only an admin can change anyone's. The
-- append-only guard on filed reports (`guard_daily_report_update`) is
-- deliberately left alone — that is a business rule about the numbers, not an
-- authorisation rule — as is `guard_debt_payment_amount`, which only checks
-- that a payment does not exceed what is still owed.

begin;

create or replace function public.guard_profile_update() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Trusted maintenance: no JWT means the SQL editor, a migration or the
  -- service role, all of which bypass row-level security anyway.
  if auth.uid() is null then
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.role is distinct from old.role
     or new.branch_id is distinct from old.branch_id
     or new.is_active is distinct from old.is_active then
    raise exception 'Only an admin can change role, branch or active state'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Linking a login to a branch
-- ---------------------------------------------------------------------------

-- Creates or repairs the `profiles` row for one auth user, addressed by email.
-- Safe to run repeatedly, and safe to run against an account created either by
-- an email invite or by Google sign-in: the auth user must exist first
-- (Authentication → Users → Add user), this then points it at a branch.
create or replace function public.link_branch_user(
  user_email text,
  branch_name text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user uuid;
  target_branch uuid;
  branch_display text;
begin
  select id into target_user from auth.users where lower(email) = lower(user_email);
  if target_user is null then
    return format('No auth user with email %s — create it under Authentication → Users first.', user_email);
  end if;

  select id, name into target_branch, branch_display
  from public.branches
  where lower(name) = lower(branch_name) and is_active;

  if target_branch is null then
    return format('No active branch named %s — check supabase/seed.sql.', branch_name);
  end if;

  insert into public.profiles (id, role, branch_id, display_name, is_active)
  values (target_user, 'branch', target_branch, branch_display, true)
  on conflict (id) do update
    set role = 'branch',
        branch_id = excluded.branch_id,
        is_active = true;

  return format('Linked %s to %s — the next sign-in files for that branch.', user_email, branch_name);
end;
$$;

comment on function public.link_branch_user(text, text) is
  'Points an existing auth user at an active branch by email (idempotent). Run it in the SQL editor after the user exists.';

-- The same thing for an admin account, which has no branch.
create or replace function public.link_admin_user(user_email text) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user uuid;
begin
  select id into target_user from auth.users where lower(email) = lower(user_email);
  if target_user is null then
    return format('No auth user with email %s — create it under Authentication → Users first.', user_email);
  end if;

  insert into public.profiles (id, role, branch_id, display_name, is_active)
  values (target_user, 'admin', null, user_email, true)
  on conflict (id) do update
    set role = 'admin',
        is_active = true;

  return format('%s can now sign in as an admin.', user_email);
end;
$$;

comment on function public.link_admin_user(text) is
  'Grants the admin role to an existing auth user by email (idempotent).';

-- These functions write profile rows, so nothing reachable from the browser may
-- execute them: Supabase grants EXECUTE on new functions to `anon` and
-- `authenticated` by default, which would let any signed-in visitor call
-- `link_admin_user` over PostgREST and promote themselves. The SQL editor, a
-- migration and the service role keep access.
revoke all on function public.link_branch_user(text, text) from public, anon, authenticated;
revoke all on function public.link_admin_user(text) from public, anon, authenticated;

-- Example: link the seeded branch accounts (the auth users must already exist).
--   select public.link_admin_user('admin@sktapri.app');
--   select public.link_branch_user('kaza@sktapri.app', 'SK Kaza');
--   select public.link_branch_user('spillow@sktapri.app', 'SK Spillow');

commit;
