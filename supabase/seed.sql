-- seed.sql
-- Run after migrations.
-- Adjust emails/passwords to match your Supabase Auth setup.

-- Branches
insert into branches (id, name, is_active)
values
  (gen_random_uuid(), 'SK Spillow', true),
  (gen_random_uuid(), 'SK Kaza', true)
on conflict do nothing;

-- Admin profile placeholder (auth user created separately)
-- Admin auth user should be created with email admin@sktapri.app
insert into profiles (id, role, branch_id, display_name, is_active)
select
  auth.uid(),
  'admin',
  null,
  'SK Tapri Admin',
  true
from auth.users
where email = 'admin@sktapri.app'
and not exists (
  select 1 from profiles where id = auth.uid()
);

-- Branch profiles (link to the synthetic email users)
insert into profiles (id, role, branch_id, display_name, is_active)
select
  auth.uid(),
  'branch',
  b.id,
  b.name,
  true
from auth.users u
join branches b on lower(b.name) = 'sk spillow'
where u.email = 'spillow@sktapri.app'
and not exists (
  select 1 from profiles where id = auth.uid()
);

insert into profiles (id, role, branch_id, display_name, is_active)
select
  auth.uid(),
  'branch',
  b.id,
  b.name,
  true
from auth.users u
join branches b on lower(b.name) = 'sk kaza'
where u.email = 'kaza@sktapri.app'
and not exists (
  select 1 from profiles where id = auth.uid()
);
