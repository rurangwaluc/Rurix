begin;

alter table public.cash_drawer_movements
  add column if not exists expected_cash_before_cents integer;

alter table public.cash_drawer_movements
  add column if not exists expected_cash_after_cents integer;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'cash_drawer_movements'
      and column_name = 'balance_before_cents'
  ) then
    update public.cash_drawer_movements
    set expected_cash_before_cents = balance_before_cents
    where expected_cash_before_cents is null;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'cash_drawer_movements'
      and column_name = 'balance_after_cents'
  ) then
    update public.cash_drawer_movements
    set expected_cash_after_cents = balance_after_cents
    where expected_cash_after_cents is null;
  end if;
end $$;

update public.cash_drawer_movements
set expected_cash_before_cents = 0
where expected_cash_before_cents is null;

update public.cash_drawer_movements
set expected_cash_after_cents = expected_cash_before_cents + amount_cents
where expected_cash_after_cents is null;

alter table public.cash_drawer_movements
  alter column expected_cash_before_cents set not null;

alter table public.cash_drawer_movements
  alter column expected_cash_after_cents set not null;

create index if not exists cash_drawer_movements_session_created_idx
  on public.cash_drawer_movements (cash_drawer_session_id, created_at desc);

commit;