import { describe, expect, it } from "vitest";
import { checkPageDoc, DOC_LIMITS, fromLegacyHtml, readPageDoc, textProblems, tidyText } from "./page-doc";

const HERO = "5f0e1b1a-0000-4000-8000-000000000001";
const DOC = (...content: unknown[]) => ({ version: 2, root: { props: {} }, content });
const text = (id: string, html: string) => ({ type: "Text", props: { id, text: html } });
const section = (id: string, content: unknown[]) => ({ type: "Section", props: { id, content } });

const problemsOf = (value: unknown) => checkPageDoc(value).problems;

describe("checkPageDoc", () => {
  it("keeps a well-formed body exactly, nested blocks included", () => {
    const doc = DOC(
      text("t1", '<h2>Plans</h2><p>From <strong>$0</strong>, <a href="/pricing">see all</a>.</p>'),
      section("s1", [
        { type: "Columns", props: { id: "c1", left: [text("t2", "<p>Left</p>")], right: [] } },
        { type: "Component", props: { id: "k1", componentId: HERO, values: { heading: "Hi" } } },
      ]),
      { type: "Image", props: { id: "i1", src: "https://example.com/a.png", alt: "A" } },
    );

    expect(checkPageDoc(doc)).toEqual({ doc, problems: [] });
  });

  it("accepts the ids and the empty zones Puck writes itself", () => {
    const doc = { ...DOC(text(`Text-${HERO}`, "<p>x</p>")), zones: {} };
    expect(problemsOf(doc)).toEqual([]);
  });

  it("rejects a block type it does not know", () => {
    expect(problemsOf(DOC({ type: "Script", props: { id: "x" } }))).toEqual([
      'content[0].type "Script" is not a block type',
    ]);
  });

  it("rejects nesting deeper than the limit", () => {
    let content: unknown[] = [text("leaf", "<p>deep</p>")];
    for (let i = 0; i < DOC_LIMITS.depth + 2; i++) content = [section(`s${i}`, content)];

    expect(problemsOf(DOC(...content)).join("\n")).toContain(`nested more than ${DOC_LIMITS.depth} deep`);
  });

  it("rejects more blocks than a page holds, once", () => {
    const many = Array.from({ length: DOC_LIMITS.blocks + 5 }, (_, i) => text(`t${i}`, "<p>x</p>"));
    expect(problemsOf(DOC(...many))).toEqual([`a page holds at most ${DOC_LIMITS.blocks} blocks`]);
  });

  it("rejects a prop of the wrong type, and a prop the type does not have", () => {
    expect(
      problemsOf(
        DOC(
          { type: "Text", props: { id: "t1", text: 42 } },
          { type: "Section", props: { id: "s1", content: "nope" } },
          { type: "Image", props: { id: "i1", src: "/a.png", alt: "", onload: "x" } },
          { type: "Component", props: { id: "k1", componentId: HERO, values: { heading: 1 } } },
        ),
      ),
    ).toEqual([
      "content[0].props.text must be a string",
      "content[1].props.content must be a list of blocks",
      "content[2].props.onload is not a Image prop",
      "content[3].props.values.heading must be a string",
    ]);
  });

  it("rejects a missing or repeated id", () => {
    expect(problemsOf(DOC({ type: "Text", props: { text: "" } }))).toEqual([
      "content[0].props.id must be a short identifier",
    ]);
    expect(problemsOf(DOC(text("same", ""), text("same", "")))).toEqual([
      'content[1].props.id "same" is used twice',
    ]);
  });

  it("rejects a body that is not one", () => {
    expect(problemsOf(null)).toEqual(["a page body is an object with a content array"]);
    expect(problemsOf({ html: "<p>x</p>" })).toEqual(
      expect.arrayContaining(["version must be 2", "html is not part of a page body"]),
    );
    expect(problemsOf({ ...DOC(), root: { props: { title: "x" } } })).toEqual(["root holds no props"]);
    expect(problemsOf({ ...DOC(), zones: { "a:b": [] } })).toEqual([
      "zones are not used; nest blocks with a Section or Columns",
    ]);
  });
});

describe("textProblems", () => {
  it("allows what the rich-text editor writes once tidied", () => {
    expect(
      textProblems(
        '<h1 style="text-align: center">T</h1><ul><li><p><em>a</em> <u>b</u> <s>c</s></p></li></ul>' +
          '<p><span style="color: #ff0000">red</span> x<sub>2</sub> <img src="/a.png" alt="a"></p><hr><pre><code>x</code></pre>',
      ),
    ).toEqual([]);
  });

  it("refuses what it would not keep: classes, data- attributes, divs", () => {
    expect(textProblems('<p class="card">x</p><span data-field="a">y</span><div>z</div>')).toEqual([
      "class is not kept in text",
      "data-field is not kept in text",
      "a <div> is not text; use a Section or a Component block",
    ]);
  });
});

describe("tidyText", () => {
  it("takes off what Tiptap adds and a page does not keep, so a link can be saved", () => {
    const tiptap =
      '<p>See <a target="_blank" rel="noopener noreferrer nofollow" href="https://example.com/?a=1&amp;b=2">this</a></p>' +
      '<pre><code class="language-js">x &lt; 1</code></pre>';

    const tidy = tidyText(tiptap);
    expect(tidy).toBe(
      '<p>See <a href="https://example.com/?a=1&amp;b=2">this</a></p><pre><code>x &lt; 1</code></pre>',
    );
    expect(textProblems(tidy)).toEqual([]);
  });

  it("keeps only the styles and attributes a page keeps", () => {
    expect(tidyText('<p style="text-align: center; position: fixed">x</p>')).toBe(
      '<p style="text-align: center">x</p>',
    );
    expect(tidyText('<img src="/a.png" alt="a" title="t">')).toBe('<img src="/a.png" alt="a">');
  });
});

describe("fromLegacyHtml", () => {
  const island = (values: string, inner = '<span data-block-name class="badge">Hero</span>') =>
    `<div data-block="component" data-block-id="b-1" data-component-id="${HERO}" data-name="Hero"` +
    ` data-values="${values}" contenteditable="false" class="comp-block">${inner}</div>`;

  it("splits text and components into blocks, losing no text", () => {
    const before = '<h1>Title</h1><p>Intro with <a href="/x">a link</a> and <img src="/a.png" alt="a"></p>';
    const after = "<ul><li>one</li><li>two</li></ul>";
    const html = `${before}${island("{&quot;heading&quot;:&quot;Hi &amp; bye&quot;}")}<p><br></p>${after}`;

    expect(fromLegacyHtml(html).content).toEqual([
      { type: "Text", props: { id: "legacy-text-0", text: before } },
      { type: "Component", props: { id: "b-1", componentId: HERO, values: { heading: "Hi & bye" } } },
      { type: "Text", props: { id: "legacy-text-2", text: `<p><br></p>${after}` } },
    ]);
  });

  it("finds the end of an island whose template nests its own divs", () => {
    const html = `${island("{}", "<div><div>a</div></div><p>b</p>")}<p>after</p>`;
    expect(fromLegacyHtml(html).content.map((block) => block.type)).toEqual(["Component", "Text"]);
  });

  it("drops only text that holds nothing", () => {
    expect(fromLegacyHtml("<p><br></p> <p>&nbsp;</p>").content).toEqual([]);
    expect(fromLegacyHtml("<p><img src='/a.png'></p>").content).toHaveLength(1);
    expect(fromLegacyHtml("<hr>").content).toHaveLength(1);
  });

  it("produces a body the checker accepts, for anything the old editor saved", () => {
    const html = `<p>Hi <b>there</b></p>${island("{&quot;heading&quot;:&quot;Hi&quot;}")}<blockquote>q</blockquote>`;
    expect(checkPageDoc(fromLegacyHtml(html)).problems).toEqual([]);
  });
});

describe("readPageDoc", () => {
  it("hands a stored body back as it is", () => {
    const doc = DOC(text("t1", "<p>x</p>"));
    expect(readPageDoc(doc)).toEqual(doc);
  });

  it("reads anything else as an empty page", () => {
    for (const blocks of [[], null, 3, { html: 1 }, { version: 3, content: [] }]) {
      expect(readPageDoc(blocks).content).toEqual([]);
    }
  });
});

describe("untrusted bodies", () => {
  it("refuses unsafe text, links and component references", () => {
    const problems = problemsOf(
      DOC(
        text("t1", '<p onclick="x">Hi</p><img src="javascript:alert(1)">'),
        { type: "Image", props: { id: "i1", src: " JaVaScRiPt:alert(1)", alt: "" } },
        { type: "Component", props: { id: "k1", componentId: "not-a-uuid", values: [] } },
      ),
    );

    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining("onclick is not kept"),
        expect.stringContaining('src="javascript:alert(1)" is not a safe link'),
        "content[1].props.src is not a safe link",
        "content[2].props.componentId must be a component id",
        "content[2].props.values must be an object of strings",
      ]),
    );
  });

  it("drops an unsafe link when tidying, and leaves a disallowed tag for the checker", () => {
    expect(tidyText('<a href="javascript:alert(1)" title="t">x</a>')).toBe('<a title="t">x</a>');
    expect(textProblems(tidyText("<script>x</script>")).length).toBeGreaterThan(0);
  });

  it("reduces stored text the allowlist would not keep to its words, before any editor sees it", () => {
    const read = readPageDoc({ html: '<p onmouseover="x()">Hello <b>there</b></p><script>x()</script>' });
    expect(read.content).toEqual([{ type: "Text", props: { id: "legacy-text-0", text: "<p>Hello there x()</p>" } }]);
    expect(checkPageDoc(read).problems).toEqual([]);
  });

  it("escapes what it reduces, so a decoded entity cannot become a tag", () => {
    const read = readPageDoc({ html: '<p onclick="x">&lt;img src=x onerror=alert(1)&gt;</p>' });
    const block = read.content[0];
    expect(block.type === "Text" && block.props.text).toBe("<p>&#60;img src=x onerror=alert(1)&#62;</p>");
  });
});
