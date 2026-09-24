/**
 * Everything the Page editor needs to turn a stored document into DOM and back.
 *
 * A page's body is an HTML string, so any markup that did not come from the
 * editor's own toolbar — a paste, a drop, a row someone wrote straight into
 * `pages.blocks` — is rebuilt through the allowlist below before it is allowed
 * to become nodes. No HTML is ever interpolated into the server response, so
 * `sanitize` is the single place untrusted markup crosses into the app.
 */

export type Field = { key: string; label: string; fallback: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Tags whose whole subtree goes: keeeping the text of a `<script>` is noise. */
const DROP = new Set([
  "SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "LINK", "META", "BASE",
  "FORM", "INPUT", "BUTTON", "TEXTAREA", "SELECT", "OPTION", "VIDEO", "AUDIO",
  "CANVAS", "SVG", "MATH", "TEMPLATE", "NOSCRIPT",
]);

/** Allowed tags, and the attributes allowed on each. */
const TAGS: Record<string, string[]> = {
  P: [], BR: [], HR: [], DIV: ["data-block", "data-block-id", "data-component-id", "data-name", "data-values"],
  H1: [], H2: [], H3: [], H4: [], H5: [], H6: [],
  UL: [], OL: [], LI: [], BLOCKQUOTE: [], PRE: [], CODE: [],
  STRONG: [], B: [], EM: [], I: [], U: [], S: [], SUB: [], SUP: [],
  A: ["href", "title"], IMG: ["src", "alt"],
  SPAN: ["data-block-name", "data-field", "data-label"],
};

/** Inline styles are kept only when they are formatting the toolbar produced. */
const STYLE_PROPERTIES = new Set([
  "font-weight", "font-style", "text-decoration", "text-decoration-line",
  "text-align", "color",
]);

/** Anything without a scheme is fine (relative paths, `#anchors`). */
const unsafeUrl = (value: string) =>
  /^\s*(?:javascript|vbscript|data|file):/i.test(value.replace(/[\u0000-\u001f]/g, ""));

/** Attribute-safe escaping for the markup this module generates itself. */
export const esc = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] as string,
  );

export const parseValues = (raw: string | null): Record<string, string> | null => {
  try {
    const parsed: unknown = JSON.parse(raw ?? "");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [key, String(value)]),
    );
  } catch {
    return null;
  }
};

function clean(root: HTMLElement) {
  for (const el of [...root.querySelectorAll("*")]) {
    const allowed = TAGS[el.tagName];

    if (!allowed) {
      if (DROP.has(el.tagName)) el.remove();
      else el.replaceWith(...el.childNodes); // unknown tag: keep the words, lose the tag
      continue;
    }

    for (const { name, value } of [...el.attributes]) {
      if (name === "style") {
        const kept = value
          .split(";")
          .map((declaration) => declaration.split(":"))
          .filter(([property]) => STYLE_PROPERTIES.has((property ?? "").trim().toLowerCase()))
          .map((parts) => parts.join(":"));
        if (kept.length) el.setAttribute("style", kept.join(";"));
        else el.removeAttribute("style");
      } else if (!allowed.includes(name)) {
        el.removeAttribute(name);
      } else if ((name === "href" || name === "src") && unsafeUrl(value)) {
        el.removeAttribute(name);
      }
    }

    // Component blocks are recognised by shape, never by an attribute a paste
    // could set: a plausible block becomes one, anything else is a plain div.
    if (el.tagName === "DIV" && el.getAttribute("data-block") === "component") {
      if (UUID.test(el.getAttribute("data-component-id") ?? "") && parseValues(el.getAttribute("data-values"))) {
        el.setAttribute("contenteditable", "false");
        el.classList.add("comp-block");
      } else {
        el.removeAttribute("data-block");
        el.removeAttribute("data-block-id");
        el.removeAttribute("data-component-id");
        el.removeAttribute("data-name");
        el.removeAttribute("data-values");
      }
    }
    if (el.getAttribute("data-block-name") !== null) el.classList.add("badge");
    if (el.getAttribute("data-field") !== null) el.classList.add("comp-field");
  }
}

/** Rebuilds stored or pasted markup so only allowlisted nodes survive. */
export function sanitize(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  clean(doc.body);
  return doc.body.innerHTML;
}

/**
 * The content a component exposes to a page. Components have no stored prop
 * schema yet, so the field list is read off the name — the same heuristic the
 * Components tab uses to draw its preview. Styling is never exposed here:
 * that belongs to the Components Editor.
 */
export function componentFields(name: string): Field[] {
  const n = name.toLowerCase();
  if (/(nav|header|hero|banner|footer|menu)/.test(n))
    return [
      { key: "heading", label: "Heading", fallback: name },
      { key: "body", label: "Text", fallback: "" },
      { key: "cta", label: "Button", fallback: "Get started" },
    ];
  if (/(input|field|form|search|textarea)/.test(n))
    return [
      { key: "label", label: "Label", fallback: name },
      { key: "placeholder", label: "Placeholder", fallback: "Type here…" },
    ];
  if (/(card|panel|tile|feature|pricing|testimonial)/.test(n))
    return [
      { key: "title", label: "Title", fallback: name },
      { key: "body", label: "Text", fallback: "" },
    ];
  return [{ key: "label", label: "Label", fallback: name }];
}

export const defaultValues = (name: string) =>
  Object.fromEntries(componentFields(name).map((field) => [field.key, field.fallback]));

/**
 * The island a component is inserted as. It carries its own content so the
 * document still reads on its own, and `sanitize` marks it `contenteditable="false"`
 * as it loads: the page can hold a component and fill in its fields, but it
 * cannot restructure it.
 */
export function componentBlock(
  blockId: string,
  componentId: string,
  name: string,
  values: Record<string, string>,
) {
  const fields = componentFields(name)
    .map(
      (field) =>
        `<span data-field="${esc(field.key)}" data-label="${esc(field.label)}">${esc(
          values[field.key] ?? field.fallback,
        )}</span>`,
    )
    .join("");

  return (
    `<div data-block="component" data-block-id="${esc(blockId)}" data-component-id="${esc(componentId)}"` +
    ` data-name="${esc(name)}" data-values="${esc(JSON.stringify(values))}">` +
    `<span data-block-name>${esc(name)}</span>${fields}</div>`
  );
}

/** A caret landing spot, so a writer can keep going below a fresh island. */
export const AFTER_BLOCK = "<p><br></p>";
