create table if not exists business_document_settings (
  business_id uuid primary key references business_profile(id) on delete cascade,

  tax_label text not null default 'VAT',
  tax_rate_basis_points integer not null default 1800,
  tax_mode text not null default 'included_in_prices',

  show_tax_on_receipts boolean not null default true,
  show_tax_on_invoices boolean not null default true,

  business_tin text,

  created_by_user_id uuid references users(id) on delete set null,
  updated_by_user_id uuid references users(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table business_document_settings
  drop constraint if exists business_document_settings_tax_rate_check;

alter table business_document_settings
  add constraint business_document_settings_tax_rate_check
  check (tax_rate_basis_points >= 0 and tax_rate_basis_points <= 10000);

alter table business_document_settings
  drop constraint if exists business_document_settings_tax_mode_check;

alter table business_document_settings
  add constraint business_document_settings_tax_mode_check
  check (tax_mode in ('included_in_prices', 'added_on_top', 'no_tax'));

create index if not exists business_document_settings_updated_at_idx
  on business_document_settings(updated_at desc);

create or replace function set_business_document_settings_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists business_document_settings_set_updated_at
  on business_document_settings;

create trigger business_document_settings_set_updated_at
before update on business_document_settings
for each row
execute function set_business_document_settings_updated_at();