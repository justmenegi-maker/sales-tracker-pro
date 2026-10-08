-- 002_rls.sql
-- Row-level security policies for SK Tapri.

-- Helper: current profile (must exist)
create or replace function current_profile() returns uuid language sql security invoker as $$
  select id from profiles where id = auth.uid();
$$;

-- Branches
create policy "branches_admin_all" on branches
  for all
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

-- Profiles
create policy "profiles_users_select" on profiles
  for select
  using ( true );

create policy "profiles_insert_own" on profiles
  for insert
  with check ( auth.uid() = id );

create policy "profiles_update_own_active_fields_admin_only" on profiles
  for update
  using (
    auth.uid() = id
    or (
      exists (
        select 1 from profiles p
        where p.id = auth.uid() and p.role = 'admin'
      )
    )
  )
  with check (
    auth.uid() = id
    or (
      exists (
        select 1 from profiles p
        where p.id = auth.uid() and p.role = 'admin'
      )
    )
  );

-- Daily reports
create policy "daily_reports_branch_select_active" on daily_reports
  for select
  using (
    branch_id in (
      select branch_id from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'branch'
        and profiles.is_active
    )
  );

create policy "daily_reports_admin_select_all" on daily_reports
  for select
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

create policy "daily_reports_branch_insert" on daily_reports
  for insert
  with check (
    submitted_by = auth.uid()
    and branch_id in (
      select branch_id from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'branch'
        and profiles.is_active
    )
  );

create policy "daily_reports_admin_void_only" on daily_reports
  for update
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

-- Branches must not edit or delete submitted reports.
-- No update policy that allows branch edits; no delete policy at all.
-- Only admin can void via the status/voided fields above.

-- Report lines
create policy "report_lines_branch_select" on report_lines
  for select
  using (
    report_id in (
      select id from daily_reports
      where branch_id in (
        select branch_id from profiles
        where profiles.id = auth.uid()
          and profiles.role = 'branch'
          and profiles.is_active
      )
    )
  );

create policy "report_lines_admin_select_all" on report_lines
  for select
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

create policy "report_lines_insert_via_report" on report_lines
  for insert
  with check (
    report_id in (
      select id from daily_reports
      where submitted_by = auth.uid()
    )
  );

-- Debts
create policy "debts_branch_select" on debts
  for select
  using (
    branch_id in (
      select branch_id from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'branch'
        and profiles.is_active
    )
  );

create policy "debts_admin_select_all" on debts
  for select
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

create policy "debts_branch_insert" on debts
  for insert
  with check (
    created_by = auth.uid()
    and (
      branch_id in (
        select branch_id from profiles
        where profiles.id = auth.uid()
          and profiles.role = 'branch'
          and profiles.is_active
      )
      or
      exists (
        select 1 from profiles
        where profiles.id = auth.uid()
          and profiles.role = 'admin'
      )
    )
  );

create policy "debts_admin_update" on debts
  for update
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

create policy "debts_branch_delete_own_manual" on debts
  for delete
  using (
    created_by = auth.uid()
    and branch_id in (
      select branch_id from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'branch'
        and profiles.is_active
    )
    and source = 'manual'
  );

-- Debt payments
create policy "debt_payments_branch_select" on debt_payments
  for select
  using (
    debt_id in (
      select id from debts
      where branch_id in (
        select branch_id from profiles
        where profiles.id = auth.uid()
          and profiles.role = 'branch'
          and profiles.is_active
      )
    )
  );

create policy "debt_payments_admin_select_all" on debt_payments
  for select
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

create policy "debt_payments_insert" on debt_payments
  for insert
  with check (
    recorded_by = auth.uid()
    and (
      debt_id in (
        select id from debts
        where branch_id in (
          select branch_id from profiles
          where profiles.id = auth.uid()
            and profiles.role = 'branch'
            and profiles.is_active
        )
      )
      or
      exists (
        select 1 from profiles
        where profiles.id = auth.uid()
          and profiles.role = 'admin'
      )
    )
  );

create policy "debt_payments_admin_delete" on debt_payments
  for delete
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );
