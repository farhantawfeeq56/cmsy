"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createComponent as insertComponent,
  createSpace as insertSpace,
  db,
  deleteComponent as removeComponent,
  importComponent as copyComponent,
  insertWithSlug,
  LIMITS,
  setPageHtml,
  slugify,
  updateComponent as setComponent,
} from "@/db";
import { parseProps, parseTemplate, type Prop } from "@/db/component-template";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Server Actions are reachable by direct POST, so every value is sanitized here. */
function text(value: FormDataEntryValue | null, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function uuid(value: FormDataEntryValue | null) {
  const raw = text(value, 36);
  return UUID.test(raw) ? raw : null;
}

const refresh = () => revalidatePath("/dashboard", "layout");

/**
 * The props a component declares, written one per line as `key | Label |
 * fallback`. Parsed through `parseProps`, so a line that is not a usable prop is
 * dropped here exactly as it would be if it had arrived from an agent.
 */
function props(value: FormDataEntryValue | null): Prop[] {
  const lines = (typeof value === "string" ? value : "").split("\n").slice(0, 40);
  return parseProps(
    lines.flatMap((line) => {
      const [key, label, fallback] = line.split("|").map((part) => part.trim());
      return key ? [{ key, label: label ?? "", fallback: fallback ?? "" }] : [];
    }),
  );
}

const template = (value: FormDataEntryValue | null) =>
  parseTemplate(typeof value === "string" ? value.trim() : "");

export async function createSpace(formData: FormData) {
  // The dashboard only submits a button, so an empty name is the normal path.
  const name = text(formData.get("name"), LIMITS.spaceName) || "Untitled space";

  const row = await insertSpace(name);
  if (!row) return;

  refresh();
  // The slug actually used, which is `<slug>-2` or higher when `<slug>` is taken.
  redirect(`/dashboard/${row.slug}`);
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

  await setPageHtml(pageId, html);
}

/** Titles are edited in place, so this is submitted on blur and on Enter. */
export async function renamePage(formData: FormData) {
  const id = uuid(formData.get("id"));
  const title = text(formData.get("title"), 120);
  if (!id || !title) return;

  await db()`update pages set title = ${title} where id = ${id}`;
  refresh();
}

/**
 * A space is created unnamed — the dashboard's button has no field — so the name
 * on its own page is the editable one. The slug is deliberately left alone, so a
 * rename never breaks a link that is already out there.
 */
export async function renameSpace(formData: FormData) {
  const id = uuid(formData.get("id"));
  const name = text(formData.get("name"), LIMITS.spaceName);
  if (!id || !name) return;

  await db()`update spaces set name = ${name} where id = ${id}`;
  refresh();
}

/**
 * Removes a space and everything in it. `pages`, `components` and the space's
 * own design systems cascade in the schema, so one delete is the whole job —
 * there is nothing to sweep up here. It lands on the dashboard, because the
 * page you were on no longer exists.
 */
export async function deleteSpace(formData: FormData) {
  const id = uuid(formData.get("id"));
  if (!id) return;

  await db()`delete from spaces where id = ${id}`;
  refresh();
  redirect("/dashboard");
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
  const name = text(formData.get("name"), LIMITS.componentName);
  if (!spaceId || !name) return;

  await insertComponent(
    spaceId,
    name,
    text(formData.get("description"), LIMITS.componentDescription),
    props(formData.get("props")),
    template(formData.get("template")),
  );
  refresh();
}

/**
 * What a component declares, rather than how it looks: its props and the
 * template they fill. The name stays put, because pages and imports refer to it.
 */
export async function updateComponent(formData: FormData) {
  const spaceId = uuid(formData.get("spaceId"));
  const id = uuid(formData.get("id"));
  if (!spaceId || !id) return;

  await setComponent(spaceId, id, props(formData.get("props")), template(formData.get("template")));
  refresh();
}

/** Copies a component from another space, keeping a link to where it came from. */
export async function importComponent(formData: FormData) {
  const spaceId = uuid(formData.get("spaceId"));
  const componentId = uuid(formData.get("componentId"));
  if (!spaceId || !componentId) return;

  await copyComponent(spaceId, componentId);
  refresh();
}

export async function deleteComponent(formData: FormData) {
  const id = uuid(formData.get("id"));
  const spaceId = uuid(formData.get("spaceId"));
  if (!id || !spaceId) return;

  await removeComponent(spaceId, id);
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
