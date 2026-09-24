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

/**
 * `sanitize` writes these itself — `class="comp-block"` and
 * `contenteditable="false"` onto a component island, `badge` / `comp-field`
 * onto its fields — and what it writes is what gets stored. Accepting them on
 * any tag is what lets a page be read and written back unchanged.
 */
const GENERATED = new Set(["class", "contenteditable"]);

/** Anything without a scheme is fine (relative paths, `#anchors`). */
export const unsafeUrl = (value: string) =>
  /^\s*(?:javascript|vbscript|data|file):/i.test(value.replace(/[\u0000-\u001f]/g, ""));

// Deliberately permissive about the *shape* of a tag: a stray "<" in prose, or
// a bare attribute with no value, is passed over rather than reported. Both are
// harmless — `sanitize` normalises them away on load without losing content.
const TAG = /<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)\s*\/?>/g;
const ATTRIBUTE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

/**
 * What in `html` the editor would not keep, as one line per problem. Empty
 * means the document round-trips. Callers decide whether that is an error.
 *
 * Closing tags are skipped: it is the opening tag that decides whether the
 * content survives, and reporting both would name one problem twice.
 */
export function pageHtmlProblems(html: string): string[] {
  const problems = new Set<string>();
  // Comment bodies are not markup; a tag written inside one is not a tag.
  const body = html.replace(/<!--[\s\S]*?-->/g, "");

  for (const [, closing, rawTag, attrs] of body.matchAll(TAG)) {
    if (closing) continue;

    const tag = rawTag.toUpperCase();
    const allowed = TAGS[tag];
    if (!allowed) {
      problems.add(
        DROP.has(tag)
          ? `<${rawTag}> is removed, so anything inside it would be lost`
          : `<${rawTag}> is not part of a page document, so only its contents would be kept`,
      );
      continue;
    }

    for (const [, name, quotedDouble, quotedSingle, bare] of attrs.matchAll(ATTRIBUTE)) {
      const key = name.toLowerCase();
      const value = quotedDouble ?? quotedSingle ?? bare ?? "";

      if (key === "style") {
        for (const declaration of value.split(";")) {
          const property = declaration.split(":")[0]?.trim().toLowerCase();
          if (property && !STYLE_PROPERTIES.has(property)) {
            problems.add(`style property "${property}" is not kept`);
          }
        }
      } else if (!allowed.includes(key) && !GENERATED.has(key)) {
        problems.add(`${name} is not kept on <${rawTag}>`);
      } else if ((key === "href" || key === "src") && unsafeUrl(value)) {
        problems.add(`${name}="${value}" is not a safe link and would be removed`);
      }
    }
  }

  return [...problems];
}
