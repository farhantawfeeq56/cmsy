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
      s.design_system_id, ds.name as design_system_name
    from spaces s
    left join design_systems ds on ds.id = s.design_system_id
    order by s.created_at
  `);

export async function getSpace(slug: string) {
  const found = await rows<Space>(db()`
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
