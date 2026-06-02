-- 008_cash_drawer_business_day_rules.sql
-- Cash drawer daily rules:
-- - One drawer session per business + location + business day
-- - Closed drawer cannot be reopened the same day unless owner override is used
-- - Closing above/below expected requires a reason

alter table cash_drawer_sessions
  add column if not exists business_day date;

update cash_drawer_sessions
set business_day = coalesce(opened_at::date, current_date)
where business_day is null;

alter table cash_drawer_sessions
  alter column business_day set not null;

alter table cash_drawer_sessions
  add column if not exists close_note text,
  add column if not exists difference_reason text,
  add column if not exists reopened_at timestamptz,
  add column if not exists reopened_by_user_id uuid references users(id) on delete set null,
  add column if not exists reopen_reason text;

create unique index if not exists cash_drawer_sessions_one_per_day_idx
  on cash_drawer_sessions (business_id, branch_id, business_day);

create index if not exists cash_drawer_sessions_business_day_idx
  on cash_drawer_sessions (business_id, business_day desc);

create index if not exists cash_drawer_sessions_branch_status_idx
  on cash_drawer_sessions (business_id, branch_id, status);

alter table cash_drawer_movements
  add column if not exists note text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'cash_drawer_sessions_status_check'
  ) then
    alter table cash_drawer_sessions
      add constraint cash_drawer_sessions_status_check
      check (status in ('open', 'closed'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'cash_drawer_movements_type_check'
  ) then
    alter table cash_drawer_movements
      add constraint cash_drawer_movements_type_check
      check (
        movement_type in (
          'opening_cash',
          'cash_sale',
          'manual_cash_in',
          'manual_cash_out',
          'drawer_reopened',
          'drawer_closed'
        )
      );
  end if;
end $$;