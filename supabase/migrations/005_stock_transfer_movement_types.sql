do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select
      c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'stock_movements'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%movement_type%'
  loop
    execute format(
      'alter table public.stock_movements drop constraint if exists %I',
      constraint_record.conname
    );
  end loop;
end $$;

alter table stock_movements
  add constraint stock_movements_movement_type_check
  check (
    movement_type in (
      'INITIAL_STOCK',
      'STOCK_RECEIVED',
      'COUNT_CORRECTION',
      'DAMAGED_REPORTED',
      'DAMAGED_RESTORED',
      'MISSING_REPORTED',
      'STOLEN_REPORTED',
      'STOCK_TRANSFER_OUT',
      'STOCK_TRANSFER_IN'
    )
  );