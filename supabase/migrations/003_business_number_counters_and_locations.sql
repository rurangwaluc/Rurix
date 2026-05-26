create table if not exists business_number_counters (
  business_id uuid not null references business_profile(id) on delete cascade,
  counter_key text not null,
  last_number integer not null default 0 check (last_number >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_id, counter_key)
);

create index if not exists idx_business_number_counters_business_id
  on business_number_counters (business_id);

alter table branches
  add column if not exists code text;

alter table branches
  add column if not exists address text;

update branches
set code = 'LOC-' || upper(substring(id::text, 1, 8))
where code is null or trim(code) = '';

create unique index if not exists idx_branches_business_code_unique
  on branches (business_id, lower(code))
  where code is not null;