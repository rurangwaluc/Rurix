-- Product + Stock Foundation
-- Rurix generic catalog supports both products and services.
-- Products/services are business-wide.
-- Stock is branch/location-specific.
-- Every stock change is recorded as a movement.

create table if not exists item_categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business_profile(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'active',
  created_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint item_categories_status_check check (status in ('active', 'inactive')),
  constraint item_categories_name_not_empty check (length(trim(name)) >= 2),
  constraint item_categories_business_name_unique unique (business_id, name)
);

create table if not exists catalog_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business_profile(id) on delete cascade,
  category_id uuid references item_categories(id) on delete set null,

  item_kind text not null,
  name text not null,
  description text,
  sku text,
  barcode text,

  selling_price_cents bigint not null default 0,
  cost_price_cents bigint,
  track_stock boolean not null default false,

  service_duration_minutes integer,
  service_cost_estimate_cents bigint,

  status text not null default 'active',

  created_by_user_id uuid references users(id) on delete set null,
  updated_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint catalog_items_kind_check check (
    item_kind in ('PRODUCT', 'SERVICE')
  ),
  constraint catalog_items_status_check check (
    status in ('active', 'inactive')
  ),
  constraint catalog_items_name_not_empty check (length(trim(name)) >= 2),
  constraint catalog_items_selling_price_non_negative check (selling_price_cents >= 0),
  constraint catalog_items_cost_price_non_negative check (
    cost_price_cents is null or cost_price_cents >= 0
  ),
  constraint catalog_items_service_duration_positive check (
    service_duration_minutes is null or service_duration_minutes > 0
  ),
  constraint catalog_items_service_cost_estimate_non_negative check (
    service_cost_estimate_cents is null or service_cost_estimate_cents >= 0
  ),
  constraint catalog_items_service_no_stock_check check (
    item_kind <> 'SERVICE' or track_stock = false
  ),
  constraint catalog_items_business_sku_unique unique (business_id, sku),
  constraint catalog_items_business_barcode_unique unique (business_id, barcode)
);

create table if not exists branch_item_stock (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business_profile(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  item_id uuid not null references catalog_items(id) on delete cascade,

  quantity_on_hand integer not null default 0,
  quantity_available integer not null default 0,
  quantity_damaged integer not null default 0,
  low_stock_alert_quantity integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint branch_item_stock_non_negative check (
    quantity_on_hand >= 0
    and quantity_available >= 0
    and quantity_damaged >= 0
    and low_stock_alert_quantity >= 0
  ),
  constraint branch_item_stock_total_check check (
    quantity_on_hand = quantity_available + quantity_damaged
  ),
  constraint branch_item_stock_unique unique (business_id, branch_id, item_id)
);

create table if not exists stock_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business_profile(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  item_id uuid not null references catalog_items(id) on delete cascade,

  movement_type text not null,
  quantity_change integer not null,
  quantity_available_before integer not null,
  quantity_available_after integer not null,
  quantity_damaged_before integer not null,
  quantity_damaged_after integer not null,
  quantity_on_hand_before integer not null,
  quantity_on_hand_after integer not null,

  reason text,
  note text,
  reference text,

  actor_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint stock_movements_type_check check (
    movement_type in (
      'INITIAL_STOCK',
      'STOCK_RECEIVED',
      'COUNT_CORRECTION',
      'DAMAGED_REPORTED',
      'DAMAGED_RESTORED',
      'MISSING_REPORTED',
      'STOLEN_REPORTED'
    )
  ),
  constraint stock_movements_quantity_change_not_zero check (quantity_change <> 0)
);

create table if not exists catalog_price_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business_profile(id) on delete cascade,
  item_id uuid not null references catalog_items(id) on delete cascade,

  old_selling_price_cents bigint,
  new_selling_price_cents bigint not null,
  old_cost_price_cents bigint,
  new_cost_price_cents bigint,

  reason text,
  actor_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint catalog_price_events_new_selling_price_non_negative check (
    new_selling_price_cents >= 0
  )
);

create index if not exists item_categories_business_idx
  on item_categories (business_id, status, name);

create index if not exists catalog_items_business_kind_status_idx
  on catalog_items (business_id, item_kind, status, name);

create index if not exists catalog_items_business_category_idx
  on catalog_items (business_id, category_id);

create index if not exists branch_item_stock_business_branch_idx
  on branch_item_stock (business_id, branch_id);

create index if not exists branch_item_stock_business_item_idx
  on branch_item_stock (business_id, item_id);

create index if not exists stock_movements_business_branch_item_idx
  on stock_movements (business_id, branch_id, item_id, created_at desc);

create index if not exists stock_movements_business_type_idx
  on stock_movements (business_id, movement_type, created_at desc);

create index if not exists catalog_price_events_business_item_idx
  on catalog_price_events (business_id, item_id, created_at desc);