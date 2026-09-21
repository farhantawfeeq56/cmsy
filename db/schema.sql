-- CMSy core schema: spaces hold pages and components, and own a design system
-- (which may be swapped for another space's). Idempotent — safe to re-run.

create table if not exists spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists design_systems (
  id uuid primary key default gen_random_uuid(),
  space_id uuid references spaces(id) on delete cascade,
  name text not null,
  tokens jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table spaces
  add column if not exists design_system_id uuid references design_systems(id) on delete set null;

create table if not exists pages (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references spaces(id) on delete cascade,
  title text not null,
  slug text not null,
  blocks jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (space_id, slug)
);

create table if not exists components (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references spaces(id) on delete cascade,
  name text not null,
  description text not null default '',
  origin_component_id uuid references components(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (space_id, name)
);

create index if not exists pages_space_idx on pages (space_id);
create index if not exists components_space_idx on components (space_id);
create index if not exists design_systems_space_idx on design_systems (space_id);

-- Agent credentials for /api/mcp. Only the hash is stored: the plaintext is
-- shown once at issuance and is unrecoverable afterwards, so a leaked database
-- dump yields no working tokens.
--
-- `owner` is a sentinel ('local') until a login flow exists — nothing in the app
-- signs anyone in yet (#21), so every token belongs to whoever can reach the
-- dashboard. TODO(#24): populate it with the Neon Auth subject once JWTs are
-- verified, which needs no migration.
create table if not exists mcp_tokens (
  id uuid primary key default gen_random_uuid(),
  owner text not null default 'local',
  name text not null,
  token_prefix text not null,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index if not exists mcp_tokens_owner_idx on mcp_tokens (owner);
