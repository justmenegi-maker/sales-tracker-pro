-- 004_branch_read_access.sql
-- 002_rls.sql only lets admins read the branches table, but the daily report
-- form needs the branch name for every signed-in user (a branch user only ever
-- sees their own branch via profiles.branch_id). Branch names are not
-- sensitive, so allow a read for any authenticated user.

create policy "branches_authenticated_select" on branches
  for select
  using (auth.uid() is not null);
