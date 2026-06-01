BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES business_profile(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  email text,
  address text,
  notes text,
  status text NOT NULL DEFAULT 'active',
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT customers_status_check CHECK (status IN ('active', 'inactive')),
  CONSTRAINT customers_name_not_empty CHECK (length(trim(name)) > 0)
);

CREATE INDEX IF NOT EXISTS customers_business_id_idx
  ON customers (business_id);

CREATE INDEX IF NOT EXISTS customers_business_status_idx
  ON customers (business_id, status);

CREATE INDEX IF NOT EXISTS customers_business_phone_idx
  ON customers (business_id, phone);

CREATE TABLE IF NOT EXISTS sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES business_profile(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  sale_number text NOT NULL,
  receipt_number text,
  status text NOT NULL DEFAULT 'completed',
  sale_type text NOT NULL DEFAULT 'direct_sale',
  subtotal_cents bigint NOT NULL DEFAULT 0,
  discount_cents bigint NOT NULL DEFAULT 0,
  tax_cents bigint NOT NULL DEFAULT 0,
  total_cents bigint NOT NULL DEFAULT 0,
  paid_cents bigint NOT NULL DEFAULT 0,
  balance_cents bigint NOT NULL DEFAULT 0,
  notes text,
  completed_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sales_status_check CHECK (
    status IN ('completed', 'cancelled', 'refunded', 'partly_refunded')
  ),
  CONSTRAINT sales_sale_type_check CHECK (
    sale_type IN ('direct_sale', 'converted_proforma')
  ),
  CONSTRAINT sales_amounts_not_negative CHECK (
    subtotal_cents >= 0
    AND discount_cents >= 0
    AND tax_cents >= 0
    AND total_cents >= 0
    AND paid_cents >= 0
    AND balance_cents >= 0
  ),
  CONSTRAINT sales_sale_number_not_empty CHECK (length(trim(sale_number)) > 0),
  CONSTRAINT sales_business_sale_number_unique UNIQUE (business_id, sale_number),
  CONSTRAINT sales_business_receipt_number_unique UNIQUE (business_id, receipt_number)
);

CREATE INDEX IF NOT EXISTS sales_business_id_idx
  ON sales (business_id);

CREATE INDEX IF NOT EXISTS sales_business_branch_idx
  ON sales (business_id, branch_id);

CREATE INDEX IF NOT EXISTS sales_business_customer_idx
  ON sales (business_id, customer_id);

CREATE INDEX IF NOT EXISTS sales_business_status_idx
  ON sales (business_id, status);

CREATE INDEX IF NOT EXISTS sales_business_completed_at_idx
  ON sales (business_id, completed_at DESC);

CREATE TABLE IF NOT EXISTS sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES business_profile(id) ON DELETE CASCADE,
  sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES catalog_items(id) ON DELETE RESTRICT,
  item_name text NOT NULL,
  item_sku text,
  quantity integer NOT NULL,
  unit_price_cents bigint NOT NULL DEFAULT 0,
  discount_cents bigint NOT NULL DEFAULT 0,
  line_total_cents bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sale_items_quantity_positive CHECK (quantity > 0),
  CONSTRAINT sale_items_amounts_not_negative CHECK (
    unit_price_cents >= 0
    AND discount_cents >= 0
    AND line_total_cents >= 0
  ),
  CONSTRAINT sale_items_item_name_not_empty CHECK (length(trim(item_name)) > 0)
);

CREATE INDEX IF NOT EXISTS sale_items_business_id_idx
  ON sale_items (business_id);

CREATE INDEX IF NOT EXISTS sale_items_sale_id_idx
  ON sale_items (sale_id);

CREATE INDEX IF NOT EXISTS sale_items_business_item_idx
  ON sale_items (business_id, item_id);

CREATE TABLE IF NOT EXISTS sale_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES business_profile(id) ON DELETE CASCADE,
  sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  method text NOT NULL,
  amount_cents bigint NOT NULL,
  reference text,
  paid_at timestamptz NOT NULL DEFAULT now(),
  received_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sale_payments_method_check CHECK (
    method IN ('cash', 'mobile_money', 'bank_transfer', 'card')
  ),
  CONSTRAINT sale_payments_amount_positive CHECK (amount_cents > 0)
);

CREATE INDEX IF NOT EXISTS sale_payments_business_id_idx
  ON sale_payments (business_id);

CREATE INDEX IF NOT EXISTS sale_payments_sale_id_idx
  ON sale_payments (sale_id);

CREATE INDEX IF NOT EXISTS sale_payments_business_method_idx
  ON sale_payments (business_id, method);

CREATE TABLE IF NOT EXISTS sale_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES business_profile(id) ON DELETE CASCADE,
  sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  receipt_number text NOT NULL,
  issued_to_name text,
  issued_to_phone text,
  issued_at timestamptz NOT NULL DEFAULT now(),
  issued_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sale_receipts_receipt_number_not_empty CHECK (
    length(trim(receipt_number)) > 0
  ),
  CONSTRAINT sale_receipts_business_receipt_number_unique UNIQUE (
    business_id,
    receipt_number
  ),
  CONSTRAINT sale_receipts_sale_unique UNIQUE (sale_id)
);

CREATE INDEX IF NOT EXISTS sale_receipts_business_id_idx
  ON sale_receipts (business_id);

CREATE INDEX IF NOT EXISTS sale_receipts_sale_id_idx
  ON sale_receipts (sale_id);

ALTER TABLE stock_movements
  ADD COLUMN IF NOT EXISTS sale_id uuid REFERENCES sales(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sale_item_id uuid REFERENCES sale_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS stock_movements_sale_id_idx
  ON stock_movements (sale_id);

CREATE INDEX IF NOT EXISTS stock_movements_sale_item_id_idx
  ON stock_movements (sale_item_id);

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT con.conname
  INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE rel.relname = 'stock_movements'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%movement_type%'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE stock_movements DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE stock_movements
  ADD CONSTRAINT stock_movements_movement_type_check
  CHECK (
    movement_type IN (
      'INITIAL_STOCK',
      'STOCK_RECEIVED',
      'COUNT_CORRECTION',
      'DAMAGED_REPORTED',
      'DAMAGED_RESTORED',
      'MISSING_REPORTED',
      'STOLEN_REPORTED',
      'STOCK_TRANSFER_OUT',
      'STOCK_TRANSFER_IN',
      'STOCK_SOLD'
    )
  );

COMMIT;