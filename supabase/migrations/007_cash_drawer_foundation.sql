create table if not exists cash_drawer_sessions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business_profile(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  status text not null default 'open',
  opening_cash_cents integer not null default 0,
  expected_cash_cents integer not null default 0,
  counted_cash_cents integer,
  difference_cents integer,
  notes text,
  close_notes text,
  opened_by_user_id uuid references users(id) on delete set null,
  closed_by_user_id uuid references users(id) on delete set null,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table cash_drawer_sessions
  drop constraint if exists cash_drawer_sessions_status_check;

alter table cash_drawer_sessions
  add constraint cash_drawer_sessions_status_check
  check (status in ('open', 'closed'));

alter table cash_drawer_sessions
  drop constraint if exists cash_drawer_sessions_opening_cash_non_negative_check;

alter table cash_drawer_sessions
  add constraint cash_drawer_sessions_opening_cash_non_negative_check
  check (opening_cash_cents >= 0);

alter table cash_drawer_sessions
  drop constraint if exists cash_drawer_sessions_expected_cash_non_negative_check;

alter table cash_drawer_sessions
  add constraint cash_drawer_sessions_expected_cash_non_negative_check
  check (expected_cash_cents >= 0);

create unique index if not exists cash_drawer_one_open_per_location_idx
  on cash_drawer_sessions (business_id, branch_id)
  where status = 'open';

create index if not exists cash_drawer_sessions_business_branch_status_idx
  on cash_drawer_sessions (business_id, branch_id, status, opened_at desc);

create table if not exists cash_drawer_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business_profile(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  cash_drawer_session_id uuid not null references cash_drawer_sessions(id) on delete cascade,
  sale_id uuid references sales(id) on delete set null,
  sale_payment_id uuid references sale_payments(id) on delete set null,
  movement_type text not null,
  amount_cents integer not null,
  balance_before_cents integer not null,
  balance_after_cents integer not null,
  reason text,
  reference text,
  actor_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table cash_drawer_movements
  drop constraint if exists cash_drawer_movements_type_check;

alter table cash_drawer_movements
  add constraint cash_drawer_movements_type_check
  check (movement_type in ('opening_cash', 'cash_sale', 'cash_in', 'cash_out', 'closing_adjustment'));

create index if not exists cash_drawer_movements_session_created_idx
  on cash_drawer_movements (cash_drawer_session_id, created_at desc);

create index if not exists cash_drawer_movements_business_branch_created_idx
  on cash_drawer_movements (business_id, branch_id, created_at desc);

alter table sale_payments
  add column if not exists cash_drawer_session_id uuid references cash_drawer_sessions(id) on delete set null;

alter table sale_payments
  add column if not exists cash_drawer_movement_id uuid references cash_drawer_movements(id) on delete set null;

create index if not exists sale_payments_cash_drawer_session_idx
  on sale_payments (cash_drawer_session_id);

create index if not exists sale_payments_cash_drawer_movement_idx
  on sale_payments (cash_drawer_movement_id);
