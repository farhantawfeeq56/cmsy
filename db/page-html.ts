/**
 * The shape a page document is allowed to take, plus a checker for markup that
 * would not survive it.
 *
 * This lives beside `pageHtml` and `LIMITS` because it is the contract for the
 * `pages.blocks` column, not a detail of any one editor. Everything that writes
 * a body — the dashboard's autosave and the `set_page_blocks` MCP tool — reads
 * its rules from here, so the two cannot disagree about what a page may hold.
 *
 * It must stay import-free. The editor is a client component and pulls this
 * module into the browser bundle, so anything reached from here ships to the
 * browser too; a `db()` import would drag the Postgres driver along with it.
 *
 * The editor's `sanitize` *rebuilds* markup through these tables using the
 * browser's `DOMParser`, which a server does not have. `pageHtmlProblems`
 * cannot rebuild anything, so it does the weaker thing a server can do: report
 * what `sanitize` would throw away. That is enough to stop a writer saving a
 * document that comes back half missing when the page is next opened.
 */

/** Tags whose whole subtree goes: keeping the text of a `<script>` is noise. */
export const DROP = new Set([
  "SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "LINK", "META", "BASE",
  "FORM", "INPUT", "BUTTON", "TEXTAREA", "SELECT", "OPTION", "VIDEO", "AUDIO",
  "CANVAS", "SVG", "MATH", "TEMPLATE", "NOSCRIPT",
]);

/** Allowed tags, and the attributes allowed on each. */
export const TAGS: Record<string, string[]> = {
  P: [], BR: [], HR: [], DIV: ["data-block", "data-block-id", "data-component-id", "data-name", "data-values"],
  H1: [], H2: [], H3: [], H4: [], H5: [], H6: [],
  UL: [], OL: [], LI: [], BLOCKQUOTE: [], PRE: [], CODE: [],
  STRONG: [], B: [], EM: [], I: [], U: [], S: [], SUB: [], SUP: [],
  A: ["href", "title"], IMG: ["src", "alt"],
  SPAN: ["data-block-name", "data-field", "data-label"],
};

/** Inline styles are kept only when they are formatting the toolbar produced. */
export const STYLE_PROPERTIES = new Set([
  "font-weight", "font-style", "text-decoration", "text-decoration-line",
  "text-align", "color",
]);

/** Anything without a scheme is fine (relative paths, `#anchors`). */
export const unsafeUrl = (value: string) =>
  /^\s*(?:javascript|vbscript|data|file):/i.test(value.replace(/[\u0000-\u001f]/g, ""));

/** Attribute-safe escaping for the markup this app generates itself. */
export const esc = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] as string,
  );

/** The `data-values` of a component island: a plain object of strings, or null. */
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

/**
 * The inverse of `esc`, for the one place that has to read raw HTML rather than
 * a DOM: an attribute's value as the parser would hand it over.
 *
 * A single pass, because that is what parsing does — `&amp;#106;` is the text
 * `&#106;`, not `j`. Without this a checker would misread `data-values`, which
 * is stored escaped, and could be walked past with `href="&#106;avascript:…"`,
 * which `sanitize` decodes and then refuses.
 */
export const unesc = (value: string) =>
  value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, body: string) => {
    if (body[0] === "#") {
      const code =
        body[1] === "x" || body[1] === "X"
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : entity;
    }
    return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[body.toLowerCase()] ?? entity;
  });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The attribute run excludes a bare "<", which HTML forbids inside a tag and
// which is what keeps "a < b" in prose from reading as a tag. Anything else
// about a tag's *shape* is passed over rather than reported, because `sanitize`
// normalises it away on load without losing content.
const TAG = /<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^<>"'])*?)\s*\/?>/g;
const ATTRIBUTE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
/** A valueless attribute, which the parser reports with an empty value. */
const BARE_ATTRIBUTE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)/g;

/** A void element never nests, so it must not open a level in the stack. */
const VOID = new Set(["BR", "HR", "IMG"]);

/** The same test `clean` uses to accept a component island and not unwrap it. */
const isIsland = (tag: string, attrs: Map<string, string>) =>
  tag === "DIV" &&
  attrs.get("data-block") === "component" &&
  UUID.test(attrs.get("data-component-id") ?? "") &&
  parseValues(attrs.get("data-values") ?? null) !== null;

/**
 * `class` and `contenteditable` are not in `TAGS` for any tag, because
 * `sanitize` writes them itself rather than passing them through — and only
 * onto two shapes: the island `<div>` itself, and an element inside one that
 * carries the attribute that earns it a `.badge` or a `.comp-field`. Being
 * permissive here instead would accept `<p class="callout">`, which `sanitize`
 * does strip, so `set_page_blocks` would report a save that silently lost it.
 */
function keepsGenerated(key: string, island: boolean, inIsland: boolean, attrs: Map<string, string>) {
  if (key === "contenteditable") return island;
  if (key !== "class") return false;
  if (island) return true;
  return inIsland && (attrs.has("data-block-name") || attrs.has("data-field"));
}

/**
 * What in `html` the editor would not keep, as one line per problem. Empty
 * means the document round-trips. Callers decide whether that is an error.
 *
 * Closing tags are skipped: it is the opening tag that decides whether the
 * content survives, and reporting both would name one problem twice. Nothing
 * here tracks nesting except to know whether an island is open, which is the
 * one thing `sanitize`'s generated attributes depend on.
 */
export function pageHtmlProblems(html: string): string[] {
  const problems = new Set<string>();
  // Comment bodies are not markup; a tag written inside one is not a tag.
  const body = html.replace(/<!--[\s\S]*?-->/g, "");
  const open: string[] = [];
  /** Length `open` had when the island being scanned opened, or 0 outside one. */
  let islandAt = 0;

  for (const [, closing, rawTag, attributeText] of body.matchAll(TAG)) {
    const tag = rawTag.toUpperCase();

    if (closing) {
      const at = open.lastIndexOf(tag);
      if (at === -1) continue;
      open.length = at;
      if (islandAt && open.length < islandAt) islandAt = 0;
      continue;
    }

    const attrs = new Map<string, string>();
    for (const [, name, quotedDouble, quotedSingle, bare] of attributeText.matchAll(ATTRIBUTE)) {
      // Decoded, because that is what `sanitize` sees through the parser, and
      // what `data-values` and every url check have to be judged against.
      attrs.set(name.toLowerCase(), unesc(quotedDouble ?? quotedSingle ?? bare ?? ""));
    }
    // A valueless attribute is still an attribute to the parser, and
    // `data-block-name` bare is exactly what `sanitize` looks for before it
    // awards a `.badge`, so the ones with no value have to be read too.
    for (const [, name] of attributeText.replace(ATTRIBUTE, " ").matchAll(BARE_ATTRIBUTE)) {
      const key = name.toLowerCase();
      if (!attrs.has(key)) attrs.set(key, "");
    }

    const allowed = TAGS[tag];
    if (!allowed) {
      problems.add(
        DROP.has(tag)
          ? `<${rawTag}> is removed, so anything inside it would be lost`
          : `<${rawTag}> is not part of a page document, so only its contents would be kept`,
      );
      if (!VOID.has(tag)) open.push(tag);
      continue;
    }

    const island = isIsland(tag, attrs);
    const inIsland = islandAt !== 0 && open.length >= islandAt;

    // `clean` empties these five attributes when the shape does not hold, so a
    // div that only looks like a component is a rewrite rather than a keep.
    if (!island && tag === "DIV" && attrs.get("data-block") === "component") {
      problems.add(
        "a component block needs a real data-component-id and a data-values object, or its attributes are dropped",
      );
    }

    for (const [key, value] of attrs) {
      if (key === "style") {
        for (const declaration of value.split(";")) {
          const property = declaration.split(":")[0]?.trim().toLowerCase();
          if (property && !STYLE_PROPERTIES.has(property)) {
            problems.add(`style property "${property}" is not kept`);
          }
        }
      } else if (allowed.includes(key)) {
        if ((key === "href" || key === "src") && unsafeUrl(value)) {
          problems.add(`${key}="${value}" is not a safe link and would be removed`);
        }
      } else if (!keepsGenerated(key, island, inIsland, attrs)) {
        problems.add(`${key} is not kept on <${rawTag}>`);
      }
    }

    if (island) islandAt = open.length + 1;
    if (!VOID.has(tag)) open.push(tag);
  }

  return [...problems];
}
