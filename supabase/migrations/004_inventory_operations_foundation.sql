create extension if not exists pgcrypto;

create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business_profile(id) on delete cascade,
  name text not null,
  contact_person text,
  phone text,
  email text,
  address text,
  notes text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by_user_id uuid references users(id) on delete set null,
  updated_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint suppliers_name_not_empty check (length(trim(name)) >= 2),
  constraint suppliers_business_name_unique unique (business_id, name)
);

create index if not exists idx_suppliers_business_id
  on suppliers (business_id);

create index if not exists idx_suppliers_business_status
  on suppliers (business_id, status);

create table if not exists stock_transfers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business_profile(id) on delete cascade,
  item_id uuid not null references catalog_items(id) on delete restrict,
  from_branch_id uuid not null references branches(id) on delete restrict,
  to_branch_id uuid not null references branches(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  reference text not null,
  reason text,
  note text,
  status text not null default 'completed' check (status in ('completed', 'cancelled')),
  created_by_user_id uuid references users(id) on delete set null,
  cancelled_by_user_id uuid references users(id) on delete set null,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),

  constraint stock_transfers_different_locations check (from_branch_id <> to_branch_id),
  constraint stock_transfers_reference_not_empty check (length(trim(reference)) >= 2)
);

create unique index if not exists idx_stock_transfers_business_reference_unique
  on stock_transfers (business_id, lower(reference));

create index if not exists idx_stock_transfers_business_created_at
  on stock_transfers (business_id, created_at desc);

create index if not exists idx_stock_transfers_item_id
  on stock_transfers (item_id);

create index if not exists idx_stock_transfers_from_branch_id
  on stock_transfers (from_branch_id);

create index if not exists idx_stock_transfers_to_branch_id
  on stock_transfers (to_branch_id);

create table if not exists purchase_orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business_profile(id) on delete cascade,
  supplier_id uuid not null references suppliers(id) on delete restrict,
  order_number text not null,
  status text not null default 'draft' check (
    status in (
      'draft',
      'ordered',
      'partly_received',
      'fully_received',
      'cancelled'
    )
  ),
  order_date date not null default current_date,
  expected_delivery_date date,
  delivery_branch_id uuid references branches(id) on delete restrict,
  notes text,
  ordered_by_user_id uuid references users(id) on delete set null,
  marked_ordered_by_user_id uuid references users(id) on delete set null,
  marked_ordered_at timestamptz,
  cancelled_by_user_id uuid references users(id) on delete set null,
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint purchase_orders_order_number_not_empty check (length(trim(order_number)) >= 2)
);

create unique index if not exists idx_purchase_orders_business_order_number_unique
  on purchase_orders (business_id, lower(order_number));

create index if not exists idx_purchase_orders_business_status
  on purchase_orders (business_id, status);

create index if not exists idx_purchase_orders_supplier_id
  on purchase_orders (supplier_id);

create index if not exists idx_purchase_orders_delivery_branch_id
  on purchase_orders (delivery_branch_id);

create table if not exists purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business_profile(id) on delete cascade,
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  item_id uuid not null references catalog_items(id) on delete restrict,
  quantity_ordered integer not null check (quantity_ordered > 0),
  quantity_received integer not null default 0 check (quantity_received >= 0),
  expected_unit_cost_cents integer check (expected_unit_cost_cents is null or expected_unit_cost_cents >= 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint purchase_order_items_received_not_more_than_ordered
    check (quantity_received <= quantity_ordered)
);

create unique index if not exists idx_purchase_order_items_po_item_unique
  on purchase_order_items (purchase_order_id, item_id);

create index if not exists idx_purchase_order_items_business_id
  on purchase_order_items (business_id);

create index if not exists idx_purchase_order_items_item_id
  on purchase_order_items (item_id);

create table if not exists purchase_order_receipts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business_profile(id) on delete cascade,
  purchase_order_id uuid not null references purchase_orders(id) on delete restrict,
  received_branch_id uuid not null references branches(id) on delete restrict,
  receipt_number text not null,
  received_at timestamptz not null default now(),
  note text,
  received_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint purchase_order_receipts_receipt_number_not_empty check (length(trim(receipt_number)) >= 2)
);

create unique index if not exists idx_po_receipts_business_receipt_number_unique
  on purchase_order_receipts (business_id, lower(receipt_number));

create index if not exists idx_po_receipts_purchase_order_id
  on purchase_order_receipts (purchase_order_id);

create index if not exists idx_po_receipts_business_created_at
  on purchase_order_receipts (business_id, created_at desc);

create table if not exists purchase_order_receipt_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business_profile(id) on delete cascade,
  purchase_order_receipt_id uuid not null references purchase_order_receipts(id) on delete cascade,
  purchase_order_item_id uuid not null references purchase_order_items(id) on delete restrict,
  item_id uuid not null references catalog_items(id) on delete restrict,
  quantity_received integer not null check (quantity_received > 0),
  actual_unit_cost_cents integer check (actual_unit_cost_cents is null or actual_unit_cost_cents >= 0),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_po_receipt_items_business_id
  on purchase_order_receipt_items (business_id);

create index if not exists idx_po_receipt_items_receipt_id
  on purchase_order_receipt_items (purchase_order_receipt_id);

create index if not exists idx_po_receipt_items_po_item_id
  on purchase_order_receipt_items (purchase_order_item_id);

create index if not exists idx_po_receipt_items_item_id
  on purchase_order_receipt_items (item_id);

create table if not exists purchase_order_send_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business_profile(id) on delete cascade,
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  send_method text not null check (send_method in ('pdf_download', 'email', 'whatsapp')),
  recipient_name text,
  recipient_email text,
  recipient_phone text,
  subject text,
  message text,
  status text not null default 'completed' check (
    status in ('completed', 'failed', 'not_configured')
  ),
  failure_reason text,
  sent_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_po_send_events_business_id
  on purchase_order_send_events (business_id);

create index if not exists idx_po_send_events_purchase_order_id
  on purchase_order_send_events (purchase_order_id);

alter table stock_movements
  add column if not exists stock_transfer_id uuid references stock_transfers(id) on delete set null;

alter table stock_movements
  add column if not exists purchase_order_id uuid references purchase_orders(id) on delete set null;

alter table stock_movements
  add column if not exists purchase_order_receipt_id uuid references purchase_order_receipts(id) on delete set null;

create index if not exists idx_stock_movements_stock_transfer_id
  on stock_movements (stock_transfer_id);

create index if not exists idx_stock_movements_purchase_order_id
  on stock_movements (purchase_order_id);

create index if not exists idx_stock_movements_purchase_order_receipt_id
  on stock_movements (purchase_order_receipt_id);