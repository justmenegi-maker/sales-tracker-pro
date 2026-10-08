-- 001_schema.sql
-- SK Tapri Daily Sales Report App
-- Run this in your Supabase SQL Editor after creating the project.

-- Branches
create table if not exists branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Profiles (one per auth user)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'branch')),
  branch_id uuid references branches(id) on delete set null,
  display_name text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Daily reports
create table if not exists daily_reports (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete restrict,
  report_date date not null,
  submitted_by uuid not null references profiles(id) on delete restrict,
  cash_paise integer not null default 0,
  online_paise integer not null default 0,
  total_paise integer not null default 0,
  finance_count integer not null default 0,
  has_debt boolean not null default false,
  status text not null default 'active' check (status in ('active', 'voided')),
  voided_by uuid references profiles(id) on delete set null,
  voided_at timestamptz,
  void_reason text,
  created_at timestamptz not null default now()
);

-- Report lines
create table if not exists report_lines (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references daily_reports(id) on delete cascade,
  category text not null check (category in ('finance', 'debt', 'exchange', 'cheque', 'store_use', 'others')),
  label text not null default '',
  amount_paise integer not null default 0
);

-- Debts
create table if not exists debts (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete restrict,
  report_id uuid references daily_reports(id) on delete set null,
  source text not null default 'report' check (source in ('report', 'manual')),
  product_name text not null default '',
  amount_paise integer not null default 0,
  debt_date date not null default current_date,
  status text not null default 'open' check (status in ('open', 'partial', 'cleared')),
  voided boolean not null default false,
  created_by uuid not null references profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

-- Debt payments
create table if not exists debt_payments (
  id uuid primary key default gen_random_uuid(),
  debt_id uuid not null references debts(id) on delete cascade,
  amount_paise integer not null default 0,
  paid_on date not null default current_date,
  note text,
  recorded_by uuid not null references profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_daily_reports_branch_date on daily_reports(branch_id, report_date);
create index if not exists idx_daily_reports_branch_status on daily_reports(branch_id, status);
create index if not exists idx_debts_branch_status on debts(branch_id, status);
create index if not exists idx_debts_branch_date on debts(branch_id, debt_date);
create index if not exists idx_report_lines_report on report_lines(report_id);
create index if not exists idx_debt_payments_debt on debt_payments(debt_id);

-- Row-level security is enabled by default on new Supabase tables, but be explicit.
alter table branches enable row level security;
alter table profiles enable row level security;
alter table daily_reports enable row level security;
alter table report_lines enable row level security;
alter table debts enable row level security;
alter table debt_payments enable row level security;

-- Prevent duplicate branch names among active branches
create unique index if not exists idx_branches_active_name on branches (lower(name)) where is_active;
