import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
// Generated from DESIGN.md by `scripts/sync-design.mjs` (see `npm run design:sync`).
import design from "../app/dashboard/[space]/design.generated.json";

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

export type PageDetail = Omit<PageRow, "created_at"> & { blocks: unknown };

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

/** One page, by its slug within a space, including the document body. */
export async function getPage(spaceId: string, slug: string) {
  const found = await rows<PageDetail>(db()`
    select id, title, slug, blocks
    from pages
    where space_id = ${spaceId} and slug = ${slug}
    limit 1
  `);
  return found[0] ?? null;
}

/**
 * The document lives in `blocks` as `{ html }`. An untouched page still holds
 * the column default `[]`, so anything that is not a string body reads empty.
 */
export function pageHtml(blocks: unknown) {
  const html = (blocks as { html?: unknown } | null)?.html;
  return typeof html === "string" ? html : "";
}

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
  rows<{ id: string; name: string; space_name: string; space_slug: string }>(db()`
    select c.id, c.name, s.name as space_name, s.slug as space_slug
    from components c
    join spaces s on s.id = c.space_id
    where c.space_id <> ${spaceId}
      and not exists (
        select 1 from components x
        where x.space_id = ${spaceId} and x.origin_component_id = c.id
      )
    order by s.name, c.name
  `);

/**
 * Writes shared by the dashboard's server actions and the MCP tools, so the two
 * cannot drift: each caller validates its own input shape, and the SQL lives
 * here once. The limits are the dashboard form's, applied by both callers.
 */
export const LIMITS = { spaceName: 80, componentName: 80, componentDescription: 300 };

export function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "untitled";
}

/**
 * Inserts with a collision-free slug: `on conflict do nothing` returns no row,
 * so we retry with a numeric suffix. Race-safe because the unique index decides.
 * Returns the slug that was actually used, which differs from `base` on a clash.
 */
export async function insertWithSlug(
  run: (slug: string) => PromiseLike<Row[]>,
  base: string,
): Promise<{ id: string; slug: string } | null> {
  for (let attempt = 1; attempt <= 50; attempt++) {
    const slug = attempt === 1 ? base : `${base}-${attempt}`;
    const [row] = await run(slug);
    if (row) return { id: row.id as string, slug };
  }
  return null;
}

/** A new space, with its own design system selected. Null when no slug is free. */
export async function createSpace(name: string) {
  const row = await insertWithSlug(
    (slug) => db()`insert into spaces (name, slug) values (${name}, ${slug})
      on conflict (slug) do nothing returning id`,
    slugify(name),
  );
  if (!row) return null;

  // A space starts with its own design system, seeded from DESIGN.md's tokens,
  // which it can later edit or swap for another space's.
  const [designSystem] = await rows<{ id: string }>(db()`
    insert into design_systems (space_id, name, tokens)
    values (${row.id}, ${`${name} design system`}, ${JSON.stringify(design.tokens)}::jsonb)
    returning id`);
  await db()`update spaces set design_system_id = ${designSystem.id} where id = ${row.id}`;
  return row;
}

/** Null when the space already has a component with that name. */
export async function createComponent(
  spaceId: string,
  name: string,
  description: string,
): Promise<{ id: string } | null> {
  const [row] = await rows<{ id: string }>(db()`
    insert into components (space_id, name, description)
    values (${spaceId}, ${name}, ${description})
    on conflict (space_id, name) do nothing
    returning id`);
  return row ?? null;
}

/**
 * Copies a component from another space, keeping a link to where it came from.
 * Null when the source is in the same space or the name is already taken here.
 */
export async function importComponent(
  spaceId: string,
  componentId: string,
): Promise<{ id: string; name: string } | null> {
  const [row] = await rows<{ id: string; name: string }>(db()`
    insert into components (space_id, name, description, origin_component_id)
    select ${spaceId}, name, description, id
    from components
    where id = ${componentId} and space_id <> ${spaceId}
    on conflict (space_id, name) do nothing
    returning id, name`);
  return row ?? null;
}

/** False when no such component exists in that space. */
export async function deleteComponent(spaceId: string, id: string) {
  const deleted = await rows<{ id: string }>(db()`
    delete from components where id = ${id} and space_id = ${spaceId} returning id`);
  return deleted.length > 0;
}

/** Component names are unique per space, so a name identifies one. */
export async function findComponent(
  spaceId: string,
  name: string,
): Promise<{ id: string; name: string } | null> {
  const [row] = await rows<{ id: string; name: string }>(db()`
    select id, name from components where space_id = ${spaceId} and name = ${name}`);
  return row ?? null;
}

// Tokens are grouped (`colors`, `typography`, …), so a group counts its entries;
// a bare top-level value, as older rows hold, counts as one.
export const listDesignSystems = () =>
  rows<DesignSystem>(db()`
    select d.id, d.name, d.space_id, s.name as space_name,
      (select coalesce(sum(case jsonb_typeof(g.value)
          when 'object' then (select count(*) from jsonb_object_keys(g.value))
          else 1 end), 0)::int
        from jsonb_each(d.tokens) g) as token_count
    from design_systems d
    left join spaces s on s.id = d.space_id
    order by d.created_at
  `);

export type DesignSystemTokens = {
  id: string;
  name: string;
  tokens: Record<string, unknown>;
  owner_space_id: string | null;
  owner_space_name: string | null;
  owner_space_slug: string | null;
};

/** One design system with its tokens and the space that owns it. */
export async function getDesignSystem(id: string) {
  const [row] = await rows<DesignSystemTokens>(db()`
    select d.id, d.name, d.tokens,
      s.id as owner_space_id, s.name as owner_space_name, s.slug as owner_space_slug
    from design_systems d
    left join spaces s on s.id = d.space_id
    where d.id = ${id}
  `);
  return row ?? null;
}

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
