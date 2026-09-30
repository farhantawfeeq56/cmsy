import { describe, expect, it } from "vitest";
import { checkPageDoc, type PageDoc } from "@/db/page-doc";
import { componentIds, fromEditor, toEditor } from "./blocks";

const HERO = "5f0e1b1a-0000-4000-8000-000000000001";
const CARD = "5f0e1b1a-0000-4000-8000-000000000002";

const doc: PageDoc = {
  version: 2,
  root: { props: {} },
  content: [
    { type: "Text", props: { id: "t1", text: "<p>Intro</p>" } },
    { type: "Component", props: { id: "k1", componentId: HERO, values: { heading: "Hi" } } },
    {
      type: "Section",
      props: {
        id: "s1",
        content: [
          {
            type: "Columns",
            props: {
              id: "c1",
              left: [{ type: "Component", props: { id: "k2", componentId: CARD, values: {} } }],
              right: [{ type: "Image", props: { id: "i1", src: "/a.png", alt: "" } }],
            },
          },
        ],
      },
    },
  ],
};

describe("toEditor / fromEditor", () => {
  it("names each component's type after it in the editor, however deep", () => {
    const data = toEditor(doc);
    expect(data.content[1]).toEqual({ type: `Component:${HERO}`, props: { id: "k1", values: { heading: "Hi" } } });
    const section = data.content[2].props.content as { props: { left: { type: string }[] } }[];
    expect(section[0].props.left[0].type).toBe(`Component:${CARD}`);
  });

  it("round-trips a body exactly, so a saved page reloads as it was saved", () => {
    expect(fromEditor(toEditor(doc))).toEqual(doc);
    expect(fromEditor(JSON.parse(JSON.stringify(toEditor(doc))))).toEqual(doc);
  });

  it("tidies the rich-text editor's link attributes, so a link does not block the save", () => {
    const saved = fromEditor({
      content: [
        { type: "Text", props: { id: "t1", text: '<p><a target="_blank" rel="noopener" href="/x">x</a></p>' } },
      ],
    });
    expect(saved.content[0]).toEqual({ type: "Text", props: { id: "t1", text: '<p><a href="/x">x</a></p>' } });
    expect(checkPageDoc(saved).problems).toEqual([]);
  });

  it("passes whatever else the editor holds on to the checker instead of hiding it", () => {
    const saved = fromEditor({ content: [{ type: "Marquee", props: { id: "m1" } }, null] });
    expect(checkPageDoc(saved).problems).toEqual([
      'content[0].type "Marquee" is not a block type',
      "content[1] must be { type, props }",
    ]);
  });
});

describe("componentIds", () => {
  it("finds every component a body refers to, nested ones included", () => {
    expect(componentIds(doc).sort()).toEqual([HERO, CARD].sort());
  });
});
