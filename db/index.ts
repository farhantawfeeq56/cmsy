import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

type Client = NeonQueryFunction<false, false>;
let client: Client | null = null;

/**
 * Lazy on purpose: creating the client at module scope makes `next build` die
 * while it collects page data whenever DATABASE_URL is missing, which turns a
 * config mistake into a confusing build failure.
 */
export function db(): Client {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set — run `neon env pull`.");
    client = neon(url);
  }
  return client;
}

type Row = Record<string, unknown>;

async function rows<T>(query: PromiseLike<Row[]>): Promise<T[]> {
  return (await query) as unknown as T[];
}

export type Space = {
  id: string;
  name: string;
  slug: string;
  page_count: number;
  component_count: number;
  design_system_id: string | null;
  design_system_name: string | null;
  updated_at: string;
};

export type ActivityItem = {
  id: string;
  kind: "page" | "component";
  title: string;
  created_at: string;
  space_name: string;
  space_slug: string;
};

export type PageRow = { id: string; title: string; slug: string; created_at: string };

export type ComponentRow = {
  id: string;
  name: string;
  description: string;
  origin_name: string | null;
  origin_space_name: string | null;
};

export type DesignSystem = {
  id: string;
  name: string;
  space_id: string | null;
  space_name: string | null;
  token_count: number;
};

// The neon driver has no query fragments, so the space projection repeats.
export const listSpaces = () =>
  rows<Space>(db()`
    select
      s.id, s.name, s.slug,
      (select count(*)::int from pages p where p.space_id = s.id) as page_count,
      (select count(*)::int from components c where c.space_id = s.id) as component_count,
      s.design_system_id, ds.name as design_system_name,
      greatest(
        s.created_at,
        coalesce((select max(p.created_at) from pages p where p.space_id = s.id), s.created_at),
        coalesce((select max(c.created_at) from components c where c.space_id = s.id), s.created_at)
      ) as updated_at
    from spaces s
    left join design_systems ds on ds.id = s.design_system_id
    order by s.created_at
  `);

/** Newest rows across pages and components, for the dashboard activity list. */
export const listRecentActivity = (limit = 5) =>
  rows<ActivityItem>(db()`
    select * from (
      select p.id, 'page' as kind, p.title, p.created_at, s.name as space_name, s.slug as space_slug
      from pages p join spaces s on s.id = p.space_id
      union all
      select c.id, 'component', c.name, c.created_at, s.name, s.slug
      from components c join spaces s on s.id = c.space_id
    ) recent
    order by created_at desc
    limit ${limit}
  `);

export async function getSpace(slug: string) {
  const found = await rows<Omit<Space, "updated_at">>(db()`
    select
      s.id, s.name, s.slug,
      (select count(*)::int from pages p where p.space_id = s.id) as page_count,
      (select count(*)::int from components c where c.space_id = s.id) as component_count,
      s.design_system_id, ds.name as design_system_name
    from spaces s
    left join design_systems ds on ds.id = s.design_system_id
    where s.slug = ${slug}
    limit 1
  `);
  return found[0] ?? null;
}

export const listPages = (spaceId: string) =>
  rows<PageRow>(db()`
    select id, title, slug, created_at
    from pages
    where space_id = ${spaceId}
    order by created_at
  `);

export const listComponents = (spaceId: string) =>
  rows<ComponentRow>(db()`
    select c.id, c.name, c.description,
      o.name as origin_name, os.name as origin_space_name
    from components c
    left join components o on o.id = c.origin_component_id
    left join spaces os on os.id = o.space_id
    where c.space_id = ${spaceId}
    order by c.created_at
  `);

/** Components from other spaces this space has not imported yet. */
export const listImportable = (spaceId: string) =>
  rows<{ id: string; name: string; space_name: string }>(db()`
    select c.id, c.name, s.name as space_name
    from components c
    join spaces s on s.id = c.space_id
    where c.space_id <> ${spaceId}
      and not exists (
        select 1 from components x
        where x.space_id = ${spaceId} and x.origin_component_id = c.id
      )
    order by s.name, c.name
  `);

export const listDesignSystems = () =>
  rows<DesignSystem>(db()`
    select d.id, d.name, d.space_id, s.name as space_name,
      (select count(*)::int from jsonb_object_keys(d.tokens)) as token_count
    from design_systems d
    left join spaces s on s.id = d.space_id
    order by d.created_at
  `);

export type McpToken = {
  id: string;
  owner: string;
  name: string;
  token_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

/** Live tokens first, newest first, so the useful rows stay above the fold. */
export const listMcpTokens = () =>
  rows<McpToken>(db()`
    select id, owner, name, token_prefix, created_at, last_used_at, revoked_at
    from mcp_tokens
    order by (revoked_at is not null), created_at desc
  `);

export async function insertMcpToken(token: {
  owner: string;
  name: string;
  prefix: string;
  hash: string;
}) {
  const [row] = await rows<{ id: string }>(db()`
    insert into mcp_tokens (owner, name, token_prefix, token_hash)
    values (${token.owner}, ${token.name}, ${token.prefix}, ${token.hash})
    returning id
  `);
  return row ?? null;
}

export const revokeMcpToken = (id: string) =>
  db()`update mcp_tokens set revoked_at = now() where id = ${id} and revoked_at is null`;

/**
 * Authenticates a presented token in one statement: the `where` does the lookup
 * and the revoked check, and only a matching live row gets its `last_used_at`
 * stamped. Returns null for unknown *and* revoked tokens — the caller must not
 * be able to tell those apart.
 */
export async function authenticateMcpToken(hash: string) {
  const [row] = await rows<{ id: string; owner: string; name: string }>(db()`
    update mcp_tokens
    set last_used_at = now()
    where token_hash = ${hash} and revoked_at is null
    returning id, owner, name
  `);
  return row ?? null;
}
