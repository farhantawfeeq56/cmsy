/**
 * Everything the Page editor needs to turn a stored document into DOM and back.
 *
 * A page's body is an HTML string, so any markup that did not come from the
 * editor's own toolbar — a paste, a drop, a row someone wrote straight into
 * `pages.blocks` — is rebuilt through the allowlist below before it is allowed
 * to become nodes. No HTML is ever interpolated into the server response, so
 * `sanitize` is the single place untrusted markup crosses into the app.
 *
 * The allowlist itself lives in `@/db/page-html`, next to the column it
 * describes, because the server-side checker and `set_page_blocks` read the
 * same rules; only the rebuilding stays here, where a `DOMParser` exists.
 */

import { propValues, renderComponent, type Prop } from "@/db/component-template";
import { DROP, esc, parseValues, STYLE_PROPERTIES, TAGS, unsafeUrl } from "@/db/page-html";

// Re-exported because the editor has always reached for these through `./doc`,
// and where they are defined is not the editor's business.
export { esc, parseValues };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    // A block's own markup, and only inside a block: a pasted `<span data-field>`
    // must not render as if it were an editable component field.
    if (el.parentElement?.closest(".comp-block")) {
      if (el.getAttribute("data-block-name") !== null) el.classList.add("badge");
      if (el.getAttribute("data-field") !== null) el.classList.add("comp-field");
    } else if (el.tagName === "SPAN") {
      for (const attribute of ["data-block-name", "data-field", "data-label"]) {
        el.removeAttribute(attribute);
      }
    }
  }
}

/** Rebuilds stored or pasted markup so only allowlisted nodes survive. */
export function sanitize(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  clean(doc.body);
  return doc.body.innerHTML;
}

/**
 * The island a component is inserted as. Its content is the component's own
 * template, rendered with the values the page has set — there is no name
 * heuristic left to guess at it. `sanitize` marks the island
 * `contenteditable="false"` as it loads, so a page can hold a component and
 * fill in its props, but cannot restructure it.
 *
 * A component with no template renders nothing and is refused at insert time,
 * which is why the caller checks `renderComponent` before calling this.
 */
export function componentBlock(
  blockId: string,
  component: { id: string; name: string; props: Prop[]; template: string },
  values: Record<string, string>,
) {
  const filled = propValues(component.props, values);

  return (
    `<div data-block="component" data-block-id="${esc(blockId)}" data-component-id="${esc(component.id)}"` +
    ` data-name="${esc(component.name)}" data-values="${esc(JSON.stringify(filled))}">` +
    renderComponent(component.props, component.template, filled) +
    `</div>`
  );
}

/** A caret landing spot, so a writer can keep going below a fresh island. */
export const AFTER_BLOCK = "<p><br></p>";
