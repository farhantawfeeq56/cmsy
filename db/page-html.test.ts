import { describe, expect, it } from "vitest";
import { pageHtmlProblems } from "./page-html";

/** The markup the editor itself produces, which must always pass. */
const editorDocument = `<h1>Pricing</h1><p>Simple, <strong>honest</strong> pricing.</p>
<ul><li>First</li><li>Second</li></ul>
<p><a href="/docs" title="Docs">Read the docs</a></p>
<p><img src="/shot.png" alt="A screenshot"></p>
<p style="color:red;text-align:center">Centred</p>`;

describe("pageHtmlProblems", () => {
  it("passes the markup the editor produces", () => {
    expect(pageHtmlProblems(editorDocument)).toEqual([]);
  });

  it("passes an empty document, which is what a new page holds", () => {
    expect(pageHtmlProblems("")).toEqual([]);
  });

  it("passes a stored component island, which carries what sanitize wrote", () => {
    const block = `<div data-block="component" data-block-id="5f0e1b1a-0000-4000-8000-000000000000" data-component-id="5f0e1b1a-0000-4000-8000-000000000001" data-name="Hero" data-values="{&quot;heading&quot;:&quot;Hi&quot;}" contenteditable="false" class="comp-block"><span data-block-name class="badge">Hero</span><span data-field="heading" data-label="Heading" class="comp-field">Hi</span></div>`;
    expect(pageHtmlProblems(block)).toEqual([]);
  });

  it("passes a real body read straight out of a live page", () => {
    // Copied from `get_page` on the marketing site's Home page. The editor
    // stores what `sanitize` produced, so this is the shape a read-write round
    // trip has to survive: `class`, `contenteditable` and the `data-*` the
    // component island is recognised by, plus `data-block-name` serialised with
    // an empty value.
    const stored = `<div data-block="component" data-block-id="ef26ea8c-3573-4ac8-8937-c53a364c2c0b" data-component-id="afd74bf3-8aac-491d-a5ed-012f101ccda1" data-name="Navbar" data-values="{&quot;heading&quot;:&quot;Navbar&quot;,&quot;body&quot;:&quot;Hello&quot;,&quot;cta&quot;:&quot;Get started&quot;}" contenteditable="false" class="comp-block"><span data-block-name="" class="badge">Navbar</span><span data-field="heading" data-label="Heading" class="comp-field">Navbar</span><span data-field="body" data-label="Text" class="comp-field">Hello</span><span data-field="cta" data-label="Button" class="comp-field">Get started</span></div><p>He<b>llow</b></p>`;
    expect(pageHtmlProblems(stored)).toEqual([]);
  });

  it("reports a dropped tag as lost content, not a renamed tag", () => {
    expect(pageHtmlProblems("<script>alert(1)</script>")).toEqual([
      "<script> is removed, so anything inside it would be lost",
    ]);
  });

  it("reports an unknown tag separately from a dropped one", () => {
    expect(pageHtmlProblems("<table><tr><td>a</td></tr></table>")).toEqual([
      "<table> is not part of a page document, so only its contents would be kept",
      "<tr> is not part of a page document, so only its contents would be kept",
      "<td> is not part of a page document, so only its contents would be kept",
    ]);
  });

  // The island allowance is not blanket. These are exactly the shapes
  // `sanitize` strips `class` and `contenteditable` from, so accepting them
  // would mean reporting a save that had quietly lost an attribute.
  it("reports class on an element that is not a component island", () => {
    expect(pageHtmlProblems('<p class="callout">Note</p>')).toEqual([
      "class is not kept on <p>",
    ]);
  });

  it("reports contenteditable outside a component island", () => {
    expect(pageHtmlProblems('<h2 contenteditable="true">Title</h2>')).toEqual([
      "contenteditable is not kept on <h2>",
    ]);
  });

  it("reports class on a stray span no island would claim", () => {
    expect(pageHtmlProblems('<span class="badge">New</span>')).toEqual([
      "class is not kept on <span>",
    ]);
  });

  it("reports a div that only looks like a component block", () => {
    expect(pageHtmlProblems('<div data-block="component">Hi</div>')).toEqual([
      "a component block needs a real data-component-id and a data-values object, or its attributes are dropped",
    ]);
  });

  it("keeps class on a field span inside a component island", () => {
    const island = `<div data-block="component" data-block-id="5f0e1b1a-0000-4000-8000-000000000000" data-component-id="5f0e1b1a-0000-4000-8000-000000000001" data-name="Hero" data-values="{&quot;heading&quot;:&quot;Hi&quot;}" contenteditable="false" class="comp-block"><span data-field="heading" data-label="Heading" class="comp-field">Hi</span></div>`;
    expect(pageHtmlProblems(island)).toEqual([]);
  });

  it("reports an attribute the editor would strip", () => {
    expect(pageHtmlProblems('<p onclick="steal()">hi</p>')).toEqual([
      "onclick is not kept on <p>",
    ]);
  });

  it("reports an unsafe link target", () => {
    expect(pageHtmlProblems('<a href="javascript:steal()">hi</a>')).toEqual([
      'href="javascript:steal()" is not a safe link and would be removed',
    ]);
  });

  it("reports only the style properties that are dropped", () => {
    expect(pageHtmlProblems('<p style="color:red;position:fixed">x</p>')).toEqual([
      'style property "position" is not kept',
    ]);
  });

  it("ignores markup written inside a comment, which is not markup", () => {
    expect(pageHtmlProblems("<!-- <marquee>no</marquee> -->")).toEqual([]);
  });

  it("reports a valueless attribute the parser would report and sanitize drop", () => {
    expect(pageHtmlProblems("<p hidden>Note</p>")).toEqual([
      "hidden is not kept on <p>",
    ]);
  });

  it("sees through an escaped url, which the parser would decode", () => {
    expect(pageHtmlProblems('<a href="&#106;avascript:steal()">hi</a>')).toEqual([
      'href="javascript:steal()" is not a safe link and would be removed',
    ]);
  });

  it("ignores a stray closing tag, which has no content of its own", () => {
    expect(pageHtmlProblems("</table>")).toEqual([]);
  });

  it("accepts a stray < in prose rather than reporting it", () => {
    expect(pageHtmlProblems("<p>a < b</p>")).toEqual([]);
  });
});
