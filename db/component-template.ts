/**
 * A component's declared props, and the template that turns them into markup.
 *
 * A component used to expose content inferred from its own name — one regex
 * that guessed whether it was a card or a nav. There is no component runtime
 * and nothing is compiled, so what a component *is* here is a declared list of
 * props plus an HTML template with `{{key}}` holes for them. Rendering is a
 * substitution, and this is the one place a component becomes a page's markup.
 *
 * Import-free and browser-safe, like `db/page-html`: the editor renders through
 * it on the client, the Design tab renders through it on the server, and a
 * server-side tool renders through it with no DOM at all.
 */

import { esc, pageHtmlProblems } from "./page-html";

export type Prop = { key: string; label: string; fallback: string };

export const PROP_LIMITS = {
  count: 12,
  key: 40,
  label: 60,
  fallback: 300,
  template: 4_000,
};

/** `{{heading}}`, which is how a template names the prop that fills it. */
const PLACEHOLDER = /\{\{\s*([a-zA-Z][a-zA-Z0-9_-]*)\s*\}\}/g;

/** Keys become `data-values` entries and prop names, so they stay identifier-ish. */
const KEY = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

/**
 * A component's props as stored, normalised. Accepts the jsonb the column hands
 * back and the JSON string a form or a tool may have, and drops anything that
 * is not a usable prop rather than failing the whole component.
 */
export function parseProps(value: unknown): Prop[] {
  const raw = typeof value === "string" ? safeJson(value) : value;
  if (!Array.isArray(raw)) return [];

  const props: Prop[] = [];
  const seen = new Set<string>();

  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const key = text((entry as { key?: unknown }).key, PROP_LIMITS.key);
    if (!KEY.test(key) || seen.has(key)) continue;
    seen.add(key);
    props.push({
      key,
      label: text((entry as { label?: unknown }).label, PROP_LIMITS.label) || key,
      fallback: text((entry as { fallback?: unknown }).fallback, PROP_LIMITS.fallback),
    });
    if (props.length === PROP_LIMITS.count) break;
  }

  return props;
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export const parseTemplate = (value: unknown) =>
  typeof value === "string" ? value.slice(0, PROP_LIMITS.template) : "";

/**
 * What would stop this component from rendering safely, one line per problem.
 *
 * The template is judged by the page's own allowlist, because rendering it puts
 * its tags into a page document. On top of that, a `{{prop}}` may only sit in
 * text: inside a tag it would land in an attribute, where escaping a value is
 * not enough to keep something like a url safe.
 */
export function componentProblems(props: Prop[], template: string): string[] {
  const problems = new Set(pageHtmlProblems(template));
  const declared = new Set(props.map((prop) => prop.key));

  for (const [, tag, attributeText] of template.matchAll(/<([a-zA-Z][a-zA-Z0-9-]*)((?:[^<>])*?)>/g)) {
    if (attributeText.includes("{{")) {
      problems.add(
        `<${tag}> has a {{prop}} inside the tag, and a prop can only be placed in text`,
      );
    }
  }

  for (const [, key] of template.matchAll(PLACEHOLDER)) {
    if (!declared.has(key)) problems.add(`{{${key}}} does not match any declared prop`);
  }

  return [...problems];
}

/** Declared defaults, with whatever the page has set taking precedence. */
export function propValues(props: Prop[], values?: Record<string, string> | null): Record<string, string> {
  return Object.fromEntries(
    props.map((prop) => [prop.key, values?.[prop.key] ?? prop.fallback]),
  );
}

/**
 * The component as markup, with its props escaped into place.
 *
 * Returns nothing when the template has a problem, so no caller can render
 * markup that was never checked — including the server, which has no `sanitize`
 * to fall back on. Callers that want to say *why* read `componentProblems`.
 */
export function renderComponent(
  props: Prop[],
  template: string,
  values?: Record<string, string> | null,
): string {
  if (!template || componentProblems(props, template).length) return "";
  const filled = propValues(props, values);
  return template.replace(PLACEHOLDER, (_match, key: string) => esc(filled[key] ?? ""));
}
