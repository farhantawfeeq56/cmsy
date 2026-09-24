"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
// Generated from DESIGN.md by `scripts/sync-design.mjs` (see `npm run design:sync`).
import design from "./[space]/design.generated.json";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Server Actions are reachable by direct POST, so every value is sanitized here. */
function text(value: FormDataEntryValue | null, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function uuid(value: FormDataEntryValue | null) {
  const raw = text(value, 36);
  return UUID.test(raw) ? raw : null;
}

function slugify(value: string) {
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
 */
async function insertWithSlug(
  run: (slug: string) => PromiseLike<Record<string, unknown>[]>,
  base: string,
): Promise<{ id: string } | null> {
  for (let attempt = 1; attempt <= 50; attempt++) {
    const [row] = await run(attempt === 1 ? base : `${base}-${attempt}`);
    if (row) return row as { id: string };
  }
  return null;
}

const refresh = () => revalidatePath("/dashboard", "layout");

/** ~200KB of HTML is already a very long page; the cap bounds a hostile save. */
const MAX_BODY = 200_000;

export async function createSpace(formData: FormData) {
  const name = text(formData.get("name"), 80);
  if (!name) return;

  const base = slugify(name);
  const row = await insertWithSlug(
    (slug) => db()`insert into spaces (name, slug) values (${name}, ${slug})
      on conflict (slug) do nothing returning id`,
    base,
  );
  if (!row) return;

  // A space starts with its own design system, seeded from DESIGN.md's tokens,
  // which it can later edit or swap for another space's.
  const [designSystem] = (await db()`
    insert into design_systems (space_id, name, tokens)
    values (${row.id}, ${`${name} design system`}, ${JSON.stringify(design.tokens)}::jsonb)
    returning id`) as { id: string }[];
  await db()`update spaces set design_system_id = ${designSystem.id} where id = ${row.id}`;

  refresh();
  redirect(`/dashboard/${base}`);
}

export async function createPage(formData: FormData) {
  const spaceId = uuid(formData.get("spaceId"));
  const title = text(formData.get("title"), 120);
  if (!spaceId || !title) return;

  await insertWithSlug(
    (slug) => db()`insert into pages (space_id, title, slug) values (${spaceId}, ${title}, ${slug})
      on conflict (space_id, slug) do nothing returning id`,
    slugify(title),
  );
  refresh();
}

/**
 * The document, autosaved from the Page editor. The body is stored as an HTML
 * string inside the `blocks` jsonb, so an existing page needs no migration.
 * Deliberately no `revalidatePath` on the editor's own route: a refresh while
 * someone is typing would fight the unsaved canvas for no benefit.
 */
export async function savePageBlocks(id: string, html: string) {
  const pageId = uuid(id);
  if (!pageId || typeof html !== "string") return;

  await db()`update pages
    set blocks = ${JSON.stringify({ html: html.slice(0, MAX_BODY) })}::jsonb
    where id = ${pageId}`;
}

/** Titles are edited in place, so this is submitted on blur and on Enter. */
export async function renamePage(formData: FormData) {
  const id = uuid(formData.get("id"));
  const title = text(formData.get("title"), 120);
  if (!id || !title) return;

  await db()`update pages set title = ${title} where id = ${id}`;
  refresh();
}

export async function deletePage(formData: FormData) {
  const id = uuid(formData.get("id"));
  const spaceId = uuid(formData.get("spaceId"));
  if (!id || !spaceId) return;

  await db()`delete from pages where id = ${id} and space_id = ${spaceId}`;
  refresh();
}

export async function createComponent(formData: FormData) {
  const spaceId = uuid(formData.get("spaceId"));
  const name = text(formData.get("name"), 80);
  if (!spaceId || !name) return;

  const description = text(formData.get("description"), 300);
  await db()`insert into components (space_id, name, description)
    values (${spaceId}, ${name}, ${description})
    on conflict (space_id, name) do nothing`;
  refresh();
}

/** Copies a component from another space, keeping a link to where it came from. */
export async function importComponent(formData: FormData) {
  const spaceId = uuid(formData.get("spaceId"));
  const componentId = uuid(formData.get("componentId"));
  if (!spaceId || !componentId) return;

  await db()`insert into components (space_id, name, description, origin_component_id)
    select ${spaceId}, name, description, id
    from components
    where id = ${componentId} and space_id <> ${spaceId}
    on conflict (space_id, name) do nothing`;
  refresh();
}

export async function deleteComponent(formData: FormData) {
  const id = uuid(formData.get("id"));
  const spaceId = uuid(formData.get("spaceId"));
  if (!id || !spaceId) return;

  await db()`delete from components where id = ${id} and space_id = ${spaceId}`;
  refresh();
}

/** Points a space at its own design system or another space's. */
export async function useDesignSystem(formData: FormData) {
  const spaceId = uuid(formData.get("spaceId"));
  const designSystemId = uuid(formData.get("designSystemId"));
  if (!spaceId || !designSystemId) return;

  await db()`update spaces set design_system_id = ${designSystemId}
    where id = ${spaceId}
      and exists (select 1 from design_systems where id = ${designSystemId})`;
  refresh();
}
