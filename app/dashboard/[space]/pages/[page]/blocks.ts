/**
 * The stored page body and the editor's data, both ways.
 *
 * They are the same shape except for components. The stored body has one
 * `Component` type that names its component by id, which is what an agent
 * writes and what `db/page-doc` checks. Puck lists a type per entry in its
 * block palette, so in the editor each of the space's components is its own
 * type, `Component:<id>`, and the id moves out of the props into the name.
 */

import { DOC_VERSION, SLOTS, tidyText, type Block, type PageDoc } from "@/db/page-doc";

export const COMPONENT_PREFIX = "Component:";

/** A block as the editor holds it: any type name, any props. */
export type EditorBlock = { type: string; props: Record<string, unknown> & { id: string } };
export type EditorData = { root: { props: Record<string, unknown> }; content: EditorBlock[] };

const slotsOf = (type: string) => SLOTS[type as Block["type"]] ?? [];

export function toEditor(doc: PageDoc): EditorData {
  const walk = (content: Block[]): EditorBlock[] =>
    content.map((block): EditorBlock => {
      if (block.type === "Component") {
        const { componentId, ...props } = block.props;
        return { type: `${COMPONENT_PREFIX}${componentId}`, props };
      }
      const props: EditorBlock["props"] = { ...block.props };
      for (const slot of slotsOf(block.type)) props[slot] = walk(props[slot] as Block[]);
      return { type: block.type, props };
    });

  return { root: { props: {} }, content: walk(doc.content) };
}

/**
 * The editor's data as a body to save. Apart from `tidyText` on the rich-text
 * editor's own markup, nothing is dropped or defaulted here: the result goes to
 * `setPageDoc`, which is the one place that decides what is acceptable, so a
 * block the editor got wrong is refused rather than hidden.
 */
export function fromEditor(data: { content?: unknown }): PageDoc {
  const walk = (content: unknown): Block[] =>
    (Array.isArray(content) ? content : []).map((entry) => {
      if (!entry || typeof entry !== "object" || !("props" in entry)) return entry as Block;
      const { type, props } = entry as EditorBlock;
      if (typeof type === "string" && type.startsWith(COMPONENT_PREFIX)) {
        return {
          type: "Component",
          props: { id: props.id, componentId: type.slice(COMPONENT_PREFIX.length), values: props.values },
        } as Block;
      }
      const next: Record<string, unknown> = { ...props };
      if (type === "Text" && typeof next.text === "string") next.text = tidyText(next.text);
      for (const slot of slotsOf(type)) next[slot] = walk(next[slot]);
      return { type, props: next } as Block;
    });

  return { version: DOC_VERSION, root: { props: {} }, content: walk(data.content) };
}

/** Every component id a body refers to, however deep. */
export function componentIds(doc: PageDoc): string[] {
  const ids = new Set<string>();
  const walk = (content: Block[]) => {
    for (const block of content) {
      if (block.type === "Component") ids.add(block.props.componentId);
      for (const slot of slotsOf(block.type)) {
        walk((block.props as Record<string, unknown>)[slot] as Block[]);
      }
    }
  };
  walk(doc.content);
  return [...ids];
}
