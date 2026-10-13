-- 005_report_review.sql
-- Admin review of a filed report: tick it OK, or flag a concern.
--
-- `status` keeps meaning active/voided; review is tracked separately so a
-- branch's filed numbers are never touched by a review.

alter table daily_reports
  add column if not exists review_status text not null default 'pending'
    check (review_status in ('pending', 'ok', 'concern')),
  add column if not exists review_note text,
  add column if not exists reviewed_by uuid references profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

create index if not exists idx_daily_reports_review_status
  on daily_reports(review_status);

-- Existing policies already cover this: `daily_reports_admin_select_all` lets
-- admins read every report and `daily_reports_admin_void_only` is the only
-- update policy, so branch staff can file a report but never review one.
