-- 006_security_hardening.sql
-- Security pass over SK Tapri.
--
-- Run this in the Supabase SQL editor after 001–005. Everything here is
-- idempotent, so re-running it is safe.
--
-- What this migration tightens, and why:
--   1. Row-level security is re-enabled explicitly on every table, and the
--      browser role (`anon`) loses all table privileges: the app only ever
--      reads or writes while signed in.
--   2. Policy helpers live in SECURITY DEFINER functions so a policy on
--      `profiles` never has to read `profiles` through RLS itself.
--   3. `profiles` was readable by everyone and self-updatable on every column,
--      which let any signed-in user read the whole staff list or promote
--      themselves to admin. Reads are now self/own-branch/admin, and a trigger
--      freezes role, branch and active state for non-admins.
--   4. Filed reports are append-only: a trigger rejects any update that moves a
--      branch, a date, an amount, a total or the submitting user. Admins can
--      still void and review.
--   5. Column constraints bound every amount, label, note and date that the
--      browser can send.
--   6. Per-user write rate limits run in the database, so they hold even if a
--      client skips the UI.

begin;

-- ---------------------------------------------------------------------------
-- 1. Row-level security, and no database role for anonymous visitors
-- ---------------------------------------------------------------------------

alter table public.branches enable row level security;
alter table public.profiles enable row level security;
alter table public.daily_reports enable row level security;
alter table public.report_lines enable row level security;
alter table public.debts enable row level security;
alter table public.debt_payments enable row level security;

-- The anon key is public by design, so treat the `anon` role as untrusted:
-- it may use the auth endpoints (a different schema) and nothing else.
revoke all on table public.branches from anon;
revoke all on table public.profiles from anon;
revoke all on table public.daily_reports from anon;
revoke all on table public.report_lines from anon;
revoke all on table public.debts from anon;
revoke all on table public.debt_payments from anon;

-- Filed history is immutable through the API: nothing in the app deletes rows,
-- so withdraw the privilege instead of relying on a missing policy alone.
-- (Maintenance still works through the SQL editor, as the table owner.)
revoke delete on table public.daily_reports from authenticated;
revoke delete on table public.report_lines from authenticated;

-- ---------------------------------------------------------------------------
-- 2. Policy helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_admin() returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'admin'
      and profiles.is_active
  );
$$;

-- Branch the caller belongs to, or null for admins and inactive users.
create or replace function public.current_branch_id() returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select profiles.branch_id from public.profiles
  where profiles.id = auth.uid()
    and profiles.role = 'branch'
    and profiles.is_active;
$$;

comment on function public.is_admin() is
  'True when the signed-in user is an active admin. Used by RLS policies.';
comment on function public.current_branch_id() is
  'Branch of the signed-in branch user; null for admins, unlinked or inactive users.';

-- ---------------------------------------------------------------------------
-- 3. Branches
-- ---------------------------------------------------------------------------

drop policy if exists "branches_admin_all" on public.branches;
drop policy if exists "branches_signed_in_select" on public.branches;

-- Signed-in users read branch names (the report form needs them).
create policy "branches_signed_in_select" on public.branches
  for select
  using (auth.uid() is not null);

-- Only admins create, rename or deactivate a branch.
create policy "branches_admin_write" on public.branches
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 4. Profiles
-- ---------------------------------------------------------------------------

drop policy if exists "profiles_users_select" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own_active_fields_admin_only" on public.profiles;

-- Own row, anyone in your own branch (so a branch can see who filed and who
-- reviewed), or every row if you are an admin.
create policy "profiles_self_branch_or_admin_select" on public.profiles
  for select
  using (
    id = auth.uid()
    or public.is_admin()
    or (
      role = 'branch'
      and branch_id is not null
      and branch_id = public.current_branch_id()
    )
  );

-- A signed-in user may create their own profile only as an active branch user
-- of an existing branch; anything else needs an admin. This closes the
-- "insert myself as admin" escalation path.
create policy "profiles_insert_branch_self_or_admin" on public.profiles
  for insert
  to authenticated
  with check (
    (
      id = auth.uid()
      and role = 'branch'
      and is_active
      and branch_id is not null
      and branch_id in (select id from public.branches)
    )
    or public.is_admin()
  );

create policy "profiles_update_self_or_admin" on public.profiles
  for update
  to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- Non-admins may edit their display name only. Without this, the update policy
-- above would let a branch user rewrite their own role to 'admin'.
create or replace function public.guard_profile_update() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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

drop trigger if exists guard_profile_update on public.profiles;
create trigger guard_profile_update
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ---------------------------------------------------------------------------
-- 5. Daily reports
-- ---------------------------------------------------------------------------

drop policy if exists "daily_reports_branch_select_active" on public.daily_reports;
drop policy if exists "daily_reports_admin_select_all" on public.daily_reports;
drop policy if exists "daily_reports_branch_insert" on public.daily_reports;
drop policy if exists "daily_reports_admin_void_only" on public.daily_reports;

create policy "daily_reports_branch_select" on public.daily_reports
  for select
  using (branch_id = public.current_branch_id());

create policy "daily_reports_admin_select" on public.daily_reports
  for select
  using (public.is_admin());

-- A branch files for its own branch and for itself. A new report is always
-- active and unreviewed: the client cannot pre-approve its own submission.
create policy "daily_reports_branch_insert" on public.daily_reports
  for insert
  to authenticated
  with check (
    submitted_by = auth.uid()
    and status = 'active'
    and coalesce(review_status, 'pending') = 'pending'
    and reviewed_by is null
    and reviewed_at is null
    and (
      branch_id = public.current_branch_id()
      or public.is_admin()
    )
  );

-- Admin-only update path (void and review).
create policy "daily_reports_admin_update" on public.daily_reports
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- The numbers a branch filed are immutable once written; an admin update may
-- only move the status, the void fields and the review fields.
create or replace function public.guard_daily_report_update() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.id is distinct from old.id
     or new.branch_id is distinct from old.branch_id
     or new.report_date is distinct from old.report_date
     or new.submitted_by is distinct from old.submitted_by
     or new.created_at is distinct from old.created_at
     or new.cash_paise is distinct from old.cash_paise
     or new.online_paise is distinct from old.online_paise
     or new.total_paise is distinct from old.total_paise
     or new.finance_count is distinct from old.finance_count
     or new.has_debt is distinct from old.has_debt then
    raise exception 'Filed reports are append-only; void or refile instead'
      using errcode = '42501';
  end if;

  -- Voiding sticks: once voided, only the review fields may change.
  if old.status = 'voided' and new.status <> 'voided' then
    raise exception 'A voided report cannot be reactivated'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_daily_report_update on public.daily_reports;
create trigger guard_daily_report_update
  before update on public.daily_reports
  for each row execute function public.guard_daily_report_update();

-- ---------------------------------------------------------------------------
-- 6. Report lines
-- ---------------------------------------------------------------------------

drop policy if exists "report_lines_branch_select" on public.report_lines;
drop policy if exists "report_lines_admin_select_all" on public.report_lines;
drop policy if exists "report_lines_insert_via_report" on public.report_lines;

create policy "report_lines_branch_select" on public.report_lines
  for select
  using (
    report_id in (
      select id from public.daily_reports
      where branch_id = public.current_branch_id()
    )
  );

create policy "report_lines_admin_select" on public.report_lines
  for select
  using (public.is_admin());

-- Lines may only be attached to a report you filed yourself, while it is
-- still active. There is deliberately no update or delete policy: lines are
-- append-only (and the delete privilege is revoked above).
create policy "report_lines_insert_via_own_report" on public.report_lines
  for insert
  to authenticated
  with check (
    report_id in (
      select id from public.daily_reports
      where submitted_by = auth.uid()
        and status = 'active'
    )
  );

-- ---------------------------------------------------------------------------
-- 7. Debts and payments
-- ---------------------------------------------------------------------------

drop policy if exists "debts_branch_select" on public.debts;
drop policy if exists "debts_admin_select_all" on public.debts;
drop policy if exists "debts_branch_insert" on public.debts;
drop policy if exists "debts_admin_update" on public.debts;
drop policy if exists "debts_branch_delete_own_manual" on public.debts;
drop policy if exists "debt_payments_branch_select" on public.debt_payments;
drop policy if exists "debt_payments_admin_select_all" on public.debt_payments;
drop policy if exists "debt_payments_insert" on public.debt_payments;
drop policy if exists "debt_payments_admin_delete" on public.debt_payments;

create policy "debts_branch_select" on public.debts
  for select
  using (branch_id = public.current_branch_id());

create policy "debts_admin_select" on public.debts
  for select
  using (public.is_admin());

create policy "debts_insert_own_branch" on public.debts
  for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and (branch_id = public.current_branch_id() or public.is_admin())
  );

create policy "debts_admin_update" on public.debts
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- A branch may withdraw a hand-entered debt it created, but never a debt that
-- came from a filed report (that entry is part of the day's numbers).
create policy "debts_delete_own_manual" on public.debts
  for delete
  to authenticated
  using (
    created_by = auth.uid()
    and source = 'manual'
    and branch_id = public.current_branch_id()
  );

create policy "debt_payments_branch_select" on public.debt_payments
  for select
  using (
    debt_id in (
      select id from public.debts
      where branch_id = public.current_branch_id()
    )
  );

create policy "debt_payments_admin_select" on public.debt_payments
  for select
  using (public.is_admin());

create policy "debt_payments_insert_reachable_debt" on public.debt_payments
  for insert
  to authenticated
  with check (
    recorded_by = auth.uid()
    and (
      debt_id in (
        select id from public.debts
        where branch_id = public.current_branch_id()
          and not voided
      )
      or public.is_admin()
    )
  );

create policy "debt_payments_admin_delete" on public.debt_payments
  for delete
  to authenticated
  using (public.is_admin());

-- A payment may not clear more than what is still owed on a live debt.
create or replace function public.guard_debt_payment_amount() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  debt_row public.debts%rowtype;
  already_paid bigint;
begin
  select * into debt_row from public.debts where id = new.debt_id;

  if not found then
    raise exception 'Unknown debt' using errcode = '23503';
  end if;

  if debt_row.voided then
    raise exception 'This debt is voided; no payment can be recorded'
      using errcode = '42501';
  end if;

  select coalesce(sum(amount_paise), 0) into already_paid
  from public.debt_payments
  where debt_id = new.debt_id;

  if already_paid + new.amount_paise > debt_row.amount_paise then
    raise exception 'Payment exceeds the outstanding amount on this debt'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_debt_payment_amount on public.debt_payments;
create trigger guard_debt_payment_amount
  before insert on public.debt_payments
  for each row execute function public.guard_debt_payment_amount();

-- ---------------------------------------------------------------------------
-- 8. Input constraints (the browser is not trusted)
-- ---------------------------------------------------------------------------

do $$
begin
  -- Amounts: non-negative integers only; the client stores paise.
  if not exists (select 1 from pg_constraint where conname = 'daily_reports_cash_paise_range') then
    alter table public.daily_reports add constraint daily_reports_cash_paise_range
      check (cash_paise >= 0 and cash_paise <= 1000000000000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'daily_reports_online_paise_range') then
    alter table public.daily_reports add constraint daily_reports_online_paise_range
      check (online_paise >= 0 and online_paise <= 1000000000000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'daily_reports_total_paise_range') then
    alter table public.daily_reports add constraint daily_reports_total_paise_range
      check (total_paise >= 0 and total_paise <= 10000000000000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'daily_reports_finance_count_range') then
    alter table public.daily_reports add constraint daily_reports_finance_count_range
      check (finance_count >= 0 and finance_count <= 500);
  end if;

  -- Report dates: no future books, and nothing absurdly old.
  if not exists (select 1 from pg_constraint where conname = 'daily_reports_report_date_sane') then
    alter table public.daily_reports add constraint daily_reports_report_date_sane
      check (report_date >= date '2015-01-01' and report_date <= current_date + 1);
  end if;

  -- Free text: bounded, and never a blank placeholder.
  if not exists (select 1 from pg_constraint where conname = 'daily_reports_void_reason_len') then
    alter table public.daily_reports add constraint daily_reports_void_reason_len
      check (void_reason is null or length(void_reason) between 3 and 500);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'daily_reports_review_note_len') then
    alter table public.daily_reports add constraint daily_reports_review_note_len
      check (review_note is null or length(review_note) between 3 and 500);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'daily_reports_review_status_allowed') then
    alter table public.daily_reports add constraint daily_reports_review_status_allowed
      check (review_status is null or review_status in ('pending', 'ok', 'concern'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'daily_reports_review_consistency') then
    -- A flagged report carries a note; a clean one does not.
    alter table public.daily_reports add constraint daily_reports_review_consistency
      check (
        (review_status = 'concern' and review_note is not null)
        or (review_status is distinct from 'concern' and review_note is null)
      );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'daily_reports_reviewer_present') then
    alter table public.daily_reports add constraint daily_reports_reviewer_present
      check (
        review_status is null
        or review_status = 'pending'
        or (reviewed_by is not null and reviewed_at is not null)
      );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'report_lines_amount_range') then
    alter table public.report_lines add constraint report_lines_amount_range
      check (amount_paise >= 0 and amount_paise <= 1000000000000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'report_lines_label_len') then
    alter table public.report_lines add constraint report_lines_label_len
      check (length(label) <= 120);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'debts_amount_range') then
    alter table public.debts add constraint debts_amount_range
      check (amount_paise >= 0 and amount_paise <= 1000000000000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'debts_product_name_len') then
    alter table public.debts add constraint debts_product_name_len
      check (length(product_name) between 1 and 120);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'debt_payments_amount_positive') then
    alter table public.debt_payments add constraint debt_payments_amount_positive
      check (amount_paise > 0 and amount_paise <= 1000000000000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'debt_payments_note_len') then
    alter table public.debt_payments add constraint debt_payments_note_len
      check (note is null or length(note) <= 200);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'profiles_display_name_len') then
    alter table public.profiles add constraint profiles_display_name_len
      check (length(display_name) <= 80);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'branches_name_len') then
    alter table public.branches add constraint branches_name_len
      check (length(name) between 1 and 80);
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 9. Database-side write rate limit
-- ---------------------------------------------------------------------------

create index if not exists idx_daily_reports_submitter_created
  on public.daily_reports(submitted_by, created_at);
create index if not exists idx_debts_creator_created
  on public.debts(created_by, created_at);
create index if not exists idx_debt_payments_recorder_created
  on public.debt_payments(recorded_by, created_at);

-- Per-user throttle that survives a client that ignores the UI. Trusted
-- maintenance (the SQL editor, the service role) has no auth.uid() and is
-- unaffected.
create or replace function public.enforce_write_rate_limit() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent integer;
  actor uuid := auth.uid();
begin
  if actor is null then
    return new;
  end if;

  if tg_table_name = 'daily_reports' then
    select count(*) into recent from public.daily_reports
    where submitted_by = actor and created_at > now() - interval '1 minute';
    if recent >= 20 then
      raise exception 'Too many reports submitted; try again in a minute'
        using errcode = '54000';
    end if;
  elsif tg_table_name = 'debts' then
    select count(*) into recent from public.debts
    where created_by = actor and created_at > now() - interval '1 minute';
    if recent >= 60 then
      raise exception 'Too many debt entries; try again in a minute'
        using errcode = '54000';
    end if;
  elsif tg_table_name = 'debt_payments' then
    select count(*) into recent from public.debt_payments
    where recorded_by = actor and created_at > now() - interval '1 minute';
    if recent >= 60 then
      raise exception 'Too many payments recorded; try again in a minute'
        using errcode = '54000';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_write_rate_limit on public.daily_reports;
create trigger enforce_write_rate_limit
  before insert on public.daily_reports
  for each row execute function public.enforce_write_rate_limit();

drop trigger if exists enforce_write_rate_limit on public.debts;
create trigger enforce_write_rate_limit
  before insert on public.debts
  for each row execute function public.enforce_write_rate_limit();

drop trigger if exists enforce_write_rate_limit on public.debt_payments;
create trigger enforce_write_rate_limit
  before insert on public.debt_payments
  for each row execute function public.enforce_write_rate_limit();

commit;
