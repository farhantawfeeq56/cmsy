/**
 * A page body as blocks: the contract for the `pages.blocks` column.
 *
 * The editor is Puck, and a stored body is Puck's own data shape with a version
 * mark, so the editor loads it without translation. The block types are ours,
 * though, and so is everything below: a body can be written by the browser or
 * by an agent over MCP, and neither is trusted. `checkPageDoc` rebuilds a body
 * from the known block types and reports anything it could not keep, and the
 * one write path (`setPageDoc`) refuses a body with any problem at all.
 *
 * Import-free apart from its siblings, like `db/page-html`: the editor pulls
 * this into the browser bundle, and a server tool reads it with no DOM.
 */

import { esc, pageHtmlProblems, parseValues, STYLE_PROPERTIES, TAGS, unesc, unsafeUrl } from "./page-html";

export const DOC_VERSION = 2;

export type TextBlock = { type: "Text"; props: { id: string; text: string } };
export type ImageBlock = { type: "Image"; props: { id: string; src: string; alt: string } };
export type SectionBlock = { type: "Section"; props: { id: string; content: Block[] } };
export type ColumnsBlock = {
  type: "Columns";
  props: { id: string; left: Block[]; right: Block[] };
};
export type ComponentBlock = {
  type: "Component";
  props: { id: string; componentId: string; values: Record<string, string> };
};
export type Block = TextBlock | ImageBlock | SectionBlock | ColumnsBlock | ComponentBlock;

export type PageDoc = {
  version: typeof DOC_VERSION;
  root: { props: Record<string, never> };
  content: Block[];
};

export const DOC_LIMITS = {
  /** Section in Columns in Section… is already hard to read at three. */
  depth: 6,
  blocks: 500,
  id: 128,
  text: 50_000,
  src: 2_048,
  alt: 300,
  values: 12,
  value: 300,
};

/** Which props of a block hold child blocks. Everything that walks a tree reads this. */
export const SLOTS: Record<Block["type"], string[]> = {
  Text: [],
  Image: [],
  Section: ["content"],
  Columns: ["left", "right"],
  Component: [],
};

/** Every prop a block type may carry, and nothing else survives the check. */
const PROPS: Record<Block["type"], string[]> = {
  Text: ["id", "text"],
  Image: ["id", "src", "alt"],
  Section: ["id", "content"],
  Columns: ["id", "left", "right"],
  Component: ["id", "componentId", "values"],
};

const ID = /^[A-Za-z0-9_:.-]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The same shape `db/component-template` gives a prop key. */
const KEY = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

export const emptyDoc = (): PageDoc => ({ version: DOC_VERSION, root: { props: {} }, content: [] });

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/**
 * What in a Text block's HTML would not come back from the editor.
 *
 * The page allowlist decides what is safe; on top of it, text is only text.
 * The rich-text editor keeps no classes or `data-` attributes, and a component
 * belongs in a Component block, so a body carrying any of those would reload
 * as something other than what was saved.
 */
export function textProblems(html: string): string[] {
  const problems = pageHtmlProblems(html);
  const tags = html.replace(/<!--[\s\S]*?-->/g, "").match(/<\s*[a-zA-Z][^<>]*>/g) ?? [];
  for (const tag of tags) {
    if (/^<\s*div\b/i.test(tag)) problems.push("a <div> is not text; use a Section or a Component block");
    const attribute = tag.match(/\s(class|data-[\w-]*)\s*(=|\s|\/?>)/i);
    if (attribute) problems.push(`${attribute[1].toLowerCase()} is not kept in text`);
  }
  return [...new Set(problems)];
}

type Checked = { doc: PageDoc; problems: string[] };

/**
 * Rebuilds a page body from the known block types.
 *
 * `doc` holds only what was understood; `problems` names everything else, one
 * line each, with the path to it. A caller that saves must refuse on any
 * problem — a trimmed body saved quietly is how a page loses content.
 */
export function checkPageDoc(value: unknown): Checked {
  const problems: string[] = [];
  const ids = new Set<string>();
  let count = 0;

  if (!isObject(value)) {
    return { doc: emptyDoc(), problems: ["a page body is an object with a content array"] };
  }
  if (value.version !== DOC_VERSION) problems.push(`version must be ${DOC_VERSION}`);
  if (value.root !== undefined) {
    const props = isObject(value.root) ? value.root.props : undefined;
    if (!isObject(value.root) || (props !== undefined && (!isObject(props) || Object.keys(props).length))) {
      problems.push("root holds no props");
    }
  }
  for (const key of Object.keys(value)) {
    if (!["version", "root", "content", "zones"].includes(key)) problems.push(`${key} is not part of a page body`);
  }
  // Puck writes an empty `zones` of its own; any content in it is the legacy
  // drop-zone API, which this editor does not use.
  if (value.zones !== undefined && !(isObject(value.zones) && Object.keys(value.zones).length === 0)) {
    problems.push("zones are not used; nest blocks with a Section or Columns");
  }

  const list = (raw: unknown, path: string, depth: number): Block[] => {
    if (!Array.isArray(raw)) {
      problems.push(`${path} must be a list of blocks`);
      return [];
    }
    if (depth > DOC_LIMITS.depth) {
      problems.push(`${path} is nested more than ${DOC_LIMITS.depth} deep`);
      return [];
    }
    const blocks: Block[] = [];
    raw.forEach((entry, index) => {
      const block = one(entry, `${path}[${index}]`, depth);
      if (block) blocks.push(block);
    });
    return blocks;
  };

  const one = (raw: unknown, path: string, depth: number): Block | null => {
    if (++count > DOC_LIMITS.blocks) {
      if (count === DOC_LIMITS.blocks + 1) problems.push(`a page holds at most ${DOC_LIMITS.blocks} blocks`);
      return null;
    }
    if (!isObject(raw) || !isObject(raw.props)) {
      problems.push(`${path} must be { type, props }`);
      return null;
    }
    const type = raw.type;
    if (typeof type !== "string" || !(type in PROPS)) {
      problems.push(`${path}.type ${JSON.stringify(type)} is not a block type`);
      return null;
    }
    for (const key of Object.keys(raw)) {
      if (key !== "type" && key !== "props") problems.push(`${path}.${key} is not part of a block`);
    }

    const props = raw.props;
    const at = `${path}.props`;
    const blockType = type as Block["type"];
    for (const key of Object.keys(props)) {
      if (!PROPS[blockType].includes(key)) problems.push(`${at}.${key} is not a ${type} prop`);
    }

    const id = props.id;
    if (typeof id !== "string" || !id || id.length > DOC_LIMITS.id || !ID.test(id)) {
      problems.push(`${at}.id must be a short identifier`);
      return null;
    }
    if (ids.has(id)) problems.push(`${at}.id "${id}" is used twice`);
    ids.add(id);

    const string = (key: string, max: number) => {
      const value = props[key];
      if (typeof value !== "string") {
        problems.push(`${at}.${key} must be a string`);
        return "";
      }
      if (value.length > max) problems.push(`${at}.${key} is longer than ${max} characters`);
      return value;
    };

    switch (blockType) {
      case "Text": {
        const text = string("text", DOC_LIMITS.text);
        for (const problem of textProblems(text)) problems.push(`${at}.text: ${problem}`);
        return { type: "Text", props: { id, text } };
      }
      case "Image": {
        const src = string("src", DOC_LIMITS.src);
        if (unsafeUrl(src)) problems.push(`${at}.src is not a safe link`);
        return { type: "Image", props: { id, src, alt: string("alt", DOC_LIMITS.alt) } };
      }
      case "Section":
        return { type: "Section", props: { id, content: list(props.content, `${at}.content`, depth + 1) } };
      case "Columns":
        return {
          type: "Columns",
          props: {
            id,
            left: list(props.left, `${at}.left`, depth + 1),
            right: list(props.right, `${at}.right`, depth + 1),
          },
        };
      case "Component": {
        const componentId = string("componentId", 36);
        if (!UUID.test(componentId)) problems.push(`${at}.componentId must be a component id`);
        const values: Record<string, string> = {};
        if (!isObject(props.values)) {
          problems.push(`${at}.values must be an object of strings`);
        } else {
          const entries = Object.entries(props.values);
          if (entries.length > DOC_LIMITS.values) problems.push(`${at}.values holds at most ${DOC_LIMITS.values} props`);
          for (const [key, value] of entries.slice(0, DOC_LIMITS.values)) {
            if (!KEY.test(key)) problems.push(`${at}.values key "${key}" is not a prop name`);
            else if (typeof value !== "string") problems.push(`${at}.values.${key} must be a string`);
            else if (value.length > DOC_LIMITS.value) problems.push(`${at}.values.${key} is longer than ${DOC_LIMITS.value} characters`);
            else values[key] = value;
          }
        }
        return { type: "Component", props: { id, componentId, values } };
      }
    }
  };

  const content = list(value.content, "content", 1);
  return { doc: { version: DOC_VERSION, root: { props: {} }, content }, problems };
}

// The tokenizer `pageHtmlProblems` uses, reduced to what splitting needs.
const TAG = /<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^<>"'])*?)\s*\/?>/g;
const ATTRIBUTE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
const VOID = new Set(["BR", "HR", "IMG"]);

/**
 * The rich-text editor's own HTML, cut down to the attributes a page keeps.
 *
 * Tiptap writes a few that carry nothing the page needs — `target` and `rel`
 * on every link, a `language-` class on pasted code — and refusing the save
 * for them would leave a writer unable to save a link. This is for the
 * editor's output only, which is well-formed; a body from anywhere else is
 * checked as it is and refused on any problem, never tidied.
 */
export function tidyText(html: string): string {
  return html.replace(TAG, (whole, closing: string, rawTag: string, attributeText: string) => {
    const allowed = TAGS[rawTag.toUpperCase()];
    if (closing || !allowed) return whole;

    const kept: string[] = [];
    for (const [, name, double, single, bare] of attributeText.matchAll(ATTRIBUTE)) {
      const key = name.toLowerCase();
      const value = unesc(double ?? single ?? bare ?? "");
      if (key === "style") {
        const declarations = value
          .split(";")
          .map((declaration) => declaration.trim())
          .filter((declaration) => STYLE_PROPERTIES.has(declaration.split(":")[0].trim().toLowerCase()));
        if (declarations.length) kept.push(`style="${esc(declarations.join("; "))}"`);
      } else if (allowed.includes(key) && !key.startsWith("data-")) {
        if (!((key === "href" || key === "src") && unsafeUrl(value))) kept.push(`${key}="${esc(value)}"`);
      }
    }
    return `<${rawTag}${kept.length ? ` ${kept.join(" ")}` : ""}>`;
  });
}

/** Text that is only empty paragraphs and line breaks is not worth a block. */
const blank = (html: string) => !/<img\b|<hr\b/i.test(html) && !html.replace(/<[^>]*>|&nbsp;|\s/g, "");

/**
 * The body a page held before blocks — one HTML string with component islands
 * in it — as blocks. Text between islands becomes Text blocks, kept verbatim;
 * each top-level island becomes a Component block with the values it held.
 *
 * Nothing is saved here. The page moves forward the first time it is saved.
 */
export function fromLegacyHtml(html: string): PageDoc {
  const content: Block[] = [];
  const body = html.replace(/<!--[\s\S]*?-->/g, "");
  let depth = 0;
  let textFrom = 0;
  let island: { depth: number; attrs: Map<string, string> } | null = null;

  const pushText = (end: number) => {
    const text = body.slice(textFrom, end).trim();
    if (text && !blank(text)) {
      content.push({ type: "Text", props: { id: `legacy-text-${content.length}`, text } });
    }
  };

  for (const match of body.matchAll(TAG)) {
    const [whole, closing, rawTag, attributeText] = match;
    const tag = rawTag.toUpperCase();
    const index = match.index ?? 0;

    if (closing) {
      depth = Math.max(0, depth - 1);
      if (island && tag === "DIV" && depth === island.depth) {
        const attrs = island.attrs;
        const blockId = attrs.get("data-block-id") ?? "";
        content.push({
          type: "Component",
          props: {
            id: ID.test(blockId) && blockId.length <= DOC_LIMITS.id ? blockId : `legacy-component-${content.length}`,
            componentId: attrs.get("data-component-id") ?? "",
            values: parseValues(attrs.get("data-values") ?? null) ?? {},
          },
        });
        island = null;
        textFrom = index + whole.length;
      }
      continue;
    }

    if (VOID.has(tag) || whole.endsWith("/>")) continue;

    if (!island && depth === 0 && tag === "DIV") {
      const attrs = new Map<string, string>();
      for (const [, name, double, single, bare] of attributeText.matchAll(ATTRIBUTE)) {
        attrs.set(name.toLowerCase(), unesc(double ?? single ?? bare ?? ""));
      }
      if (
        attrs.get("data-block") === "component" &&
        UUID.test(attrs.get("data-component-id") ?? "") &&
        parseValues(attrs.get("data-values") ?? null) !== null
      ) {
        pushText(index);
        island = { depth, attrs };
      }
    }
    depth++;
  }

  if (!island) pushText(body.length);
  return { version: DOC_VERSION, root: { props: {} }, content };
}

/** Tags and entities off, and what is left escaped back into a paragraph. */
const asPlainText = (html: string) => {
  const words = unesc(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
  return words ? `<p>${words.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)}</p>` : "";
};

/**
 * A stored page body, whatever format it is in, as a document that is safe to
 * hand to the editor.
 *
 * A body in the current format was checked when it was written, so it comes
 * back as stored. A body from before blocks is converted. Either way, a Text
 * block whose HTML the allowlist would not keep is reduced to its words:
 * the editor renders text as HTML before it has parsed it, so markup that was
 * never checked must not reach it. Nothing written through `setPageDoc` or the
 * old sanitizing editor is affected — only a row written around both.
 */
export function readPageDoc(blocks: unknown): PageDoc {
  let doc: PageDoc;
  if (isObject(blocks) && blocks.version === DOC_VERSION) {
    doc = checkPageDoc(blocks).doc;
  } else if (isObject(blocks) && typeof blocks.html === "string") {
    doc = fromLegacyHtml(blocks.html);
  } else {
    return emptyDoc();
  }

  const safe = (content: Block[]): Block[] =>
    content.flatMap((block): Block[] => {
      switch (block.type) {
        case "Text": {
          if (!pageHtmlProblems(block.props.text).length) return [block];
          const text = asPlainText(block.props.text);
          return text ? [{ type: "Text", props: { ...block.props, text } }] : [];
        }
        case "Image":
          return unsafeUrl(block.props.src) ? [] : [block];
        case "Section":
          return [{ ...block, props: { ...block.props, content: safe(block.props.content) } }];
        case "Columns":
          return [
            {
              ...block,
              props: { ...block.props, left: safe(block.props.left), right: safe(block.props.right) },
            },
          ];
        default:
          return [block];
      }
    });

  return { ...doc, content: safe(doc.content) };
}
