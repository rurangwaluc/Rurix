create extension if not exists pgcrypto;
create extension if not exists citext;

create table if not exists business_profile (
  id uuid primary key default gen_random_uuid(),
  singleton_key boolean not null default true,
  name text not null,
  legal_name text,
  business_type text not null default 'product_and_service',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint business_profile_singleton check (singleton_key = true),
  constraint business_profile_singleton_unique unique (singleton_key),
  constraint business_profile_business_type_check check (
    business_type in ('product', 'service', 'product_and_service')
  ),
  constraint business_profile_status_check check (
    status in ('active', 'inactive', 'suspended')
  )
);

create table if not exists branches (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business_profile(id) on delete cascade,
  name text not null,
  code text,
  is_main boolean not null default false,
  status text not null default 'active',
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint branches_status_check check (
    status in ('active', 'inactive', 'closed')
  )
);

create unique index if not exists branches_one_main_branch_per_business
on branches (business_id)
where is_main = true;

create unique index if not exists branches_business_code_unique
on branches (business_id, lower(code))
where code is not null;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email citext not null unique,
  phone text,
  password_hash text not null,
  status text not null default 'active',
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint users_status_check check (
    status in ('active', 'inactive', 'suspended')
  )
);

create table if not exists business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business_profile(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  member_type text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint business_members_member_type_check check (
    member_type in ('PRIMARY_OWNER', 'OWNER', 'PARTNER', 'STAFF')
  ),
  constraint business_members_status_check check (
    status in ('active', 'inactive', 'suspended')
  ),
  constraint business_members_unique unique (business_id, user_id)
);

create unique index if not exists business_members_one_primary_owner
on business_members (business_id)
where member_type = 'PRIMARY_OWNER' and status = 'active';

create table if not exists branch_memberships (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business_profile(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint branch_memberships_status_check check (
    status in ('active', 'inactive', 'suspended')
  ),
  constraint branch_memberships_unique unique (business_id, branch_id, user_id)
);

create table if not exists branch_member_roles (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business_profile(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null,
  created_at timestamptz not null default now(),

  constraint branch_member_roles_role_check check (
    role in ('ADMIN', 'MANAGER', 'SELLER', 'CASHIER', 'STOREKEEPER', 'SERVICE_STAFF')
  ),
  constraint branch_member_roles_unique unique (business_id, branch_id, user_id, role)
);

create table if not exists devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  device_key text not null unique,
  device_name text,
  platform text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  device_id uuid references devices(id) on delete set null,
  status text not null default 'active',
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),

  constraint sessions_status_check check (
    status in ('active', 'revoked', 'expired')
  )
);

create index if not exists sessions_user_id_idx on sessions(user_id);
create index if not exists sessions_device_id_idx on sessions(device_id);

create table if not exists activity_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references business_profile(id) on delete cascade,
  branch_id uuid references branches(id) on delete set null,
  actor_user_id uuid references users(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_events_business_id_idx on activity_events(business_id);
create index if not exists activity_events_branch_id_idx on activity_events(branch_id);
create index if not exists activity_events_actor_user_id_idx on activity_events(actor_user_id);

create table if not exists client_events (
  id uuid primary key default gen_random_uuid(),
  client_event_id text not null unique,
  business_id uuid references business_profile(id) on delete cascade,
  branch_id uuid references branches(id) on delete set null,
  user_id uuid references users(id) on delete set null,
  device_id uuid references devices(id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  created_offline_at timestamptz,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error_message text,

  constraint client_events_status_check check (
    status in ('pending', 'processed', 'failed', 'needs_review', 'conflict')
  )
);

create index if not exists client_events_status_idx on client_events(status);
create index if not exists client_events_user_id_idx on client_events(user_id);
create index if not exists client_events_branch_id_idx on client_events(branch_id);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists business_profile_set_updated_at on business_profile;
create trigger business_profile_set_updated_at
before update on business_profile
for each row execute function set_updated_at();

drop trigger if exists branches_set_updated_at on branches;
create trigger branches_set_updated_at
before update on branches
for each row execute function set_updated_at();

drop trigger if exists users_set_updated_at on users;
create trigger users_set_updated_at
before update on users
for each row execute function set_updated_at();

drop trigger if exists business_members_set_updated_at on business_members;
create trigger business_members_set_updated_at
before update on business_members
for each row execute function set_updated_at();

drop trigger if exists branch_memberships_set_updated_at on branch_memberships;
create trigger branch_memberships_set_updated_at
before update on branch_memberships
for each row execute function set_updated_at();