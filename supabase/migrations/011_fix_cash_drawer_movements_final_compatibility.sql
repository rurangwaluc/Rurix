begin;

alter table public.cash_drawer_movements
  add column if not exists expected_cash_before_cents integer;

alter table public.cash_drawer_movements
  add column if not exists expected_cash_after_cents integer;

alter table public.cash_drawer_movements
  add column if not exists balance_before_cents integer;

alter table public.cash_drawer_movements
  add column if not exists balance_after_cents integer;

update public.cash_drawer_movements
set expected_cash_before_cents = coalesce(
  expected_cash_before_cents,
  balance_before_cents,
  0
)
where expected_cash_before_cents is null;

update public.cash_drawer_movements
set expected_cash_after_cents = coalesce(
  expected_cash_after_cents,
  balance_after_cents,
  coalesce(expected_cash_before_cents, balance_before_cents, 0) + amount_cents
)
where expected_cash_after_cents is null;

update public.cash_drawer_movements
set balance_before_cents = coalesce(
  balance_before_cents,
  expected_cash_before_cents,
  0
)
where balance_before_cents is null;

update public.cash_drawer_movements
set balance_after_cents = coalesce(
  balance_after_cents,
  expected_cash_after_cents,
  coalesce(balance_before_cents, expected_cash_before_cents, 0) + amount_cents
)
where balance_after_cents is null;

create or replace function public.sync_cash_drawer_movement_balance_columns()
returns trigger
language plpgsql
as $$
begin
  if new.expected_cash_before_cents is null then
    new.expected_cash_before_cents := coalesce(new.balance_before_cents, 0);
  end if;

  if new.expected_cash_after_cents is null then
    new.expected_cash_after_cents := coalesce(
      new.balance_after_cents,
      new.expected_cash_before_cents + new.amount_cents
    );
  end if;

  if new.balance_before_cents is null then
    new.balance_before_cents := new.expected_cash_before_cents;
  end if;

  if new.balance_after_cents is null then
    new.balance_after_cents := new.expected_cash_after_cents;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_cash_drawer_movement_balance_columns_trigger
  on public.cash_drawer_movements;

create trigger sync_cash_drawer_movement_balance_columns_trigger
before insert or update on public.cash_drawer_movements
for each row
execute function public.sync_cash_drawer_movement_balance_columns();

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'cash_drawer_movements'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%movement_type%'
  loop
    execute format(
      'alter table public.cash_drawer_movements drop constraint if exists %I',
      constraint_name
    );
  end loop;
end $$;

alter table public.cash_drawer_movements
  add constraint cash_drawer_movements_type_check
  check (
    movement_type in (
      'opening_cash',
      'cash_sale',
      'cash_in',
      'cash_out',
      'manual_cash_in',
      'manual_cash_out',
      'closing_adjustment',
      'drawer_reopened',
      'drawer_closed'
    )
  );

alter table public.cash_drawer_movements
  alter column expected_cash_before_cents set not null;

alter table public.cash_drawer_movements
  alter column expected_cash_after_cents set not null;

alter table public.cash_drawer_movements
  alter column balance_before_cents set not null;

alter table public.cash_drawer_movements
  alter column balance_after_cents set not null;

create index if not exists cash_drawer_movements_session_created_idx
  on public.cash_drawer_movements (cash_drawer_session_id, created_at desc);

commit;