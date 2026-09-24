import { describe, expect, it } from "vitest";
import {
  componentProblems,
  parseProps,
  parseTemplate,
  PROP_LIMITS,
  propValues,
  renderComponent,
} from "./component-template";

const HERO = [
  { key: "heading", label: "Heading", fallback: "Build faster" },
  { key: "cta", label: "Button", fallback: "Get started" },
];

const TEMPLATE = "<h2>{{heading}}</h2><p>Ready?</p><a href=\"/signup\">{{cta}}</a>";

describe("parseProps", () => {
  it("keeps well-formed props and defaults a missing label to the key", () => {
    expect(parseProps([{ key: "heading" }, { key: "cta", label: "Button", fallback: "Go" }])).toEqual([
      { key: "heading", label: "heading", fallback: "" },
      { key: "cta", label: "Button", fallback: "Go" },
    ]);
  });

  it("reads the JSON string a form or a tool may hand over", () => {
    expect(parseProps('[{"key":"heading","label":"Heading"}]')).toEqual([
      { key: "heading", label: "Heading", fallback: "" },
    ]);
  });

  it("drops entries that could not be a prop, rather than the whole component", () => {
    expect(
      parseProps([
        { key: "heading" },
        { key: "not a key" },
        { key: "" },
        { key: "heading" },
        null,
        "nope",
      ]),
    ).toEqual([{ key: "heading", label: "heading", fallback: "" }]);
  });

  it("caps how many props one component may declare", () => {
    const many = Array.from({ length: 30 }, (_, index) => ({ key: `p${index}` }));
    expect(parseProps(many)).toHaveLength(PROP_LIMITS.count);
  });

  it("treats anything that is not a list as no props at all", () => {
    expect(parseProps(null)).toEqual([]);
    expect(parseProps("{}")).toEqual([]);
    expect(parseProps("{not json")).toEqual([]);
  });
});

describe("parseTemplate", () => {
  it("keeps a string and refuses anything else", () => {
    expect(parseTemplate("<p>{{a}}</p>")).toBe("<p>{{a}}</p>");
    expect(parseTemplate(42)).toBe("");
    expect(parseTemplate(null)).toBe("");
  });
});

describe("componentProblems", () => {
  it("passes a template that uses declared props in text", () => {
    expect(componentProblems(HERO, TEMPLATE)).toEqual([]);
  });

  it("passes a template built from the design system's own classes", () => {
    const template =
      '<div class="card"><h3>{{heading}}</h3><span class="badge">Popular</span>' +
      '<a class="btn" href="/signup">{{cta}}</a></div>';
    expect(componentProblems(HERO, template)).toEqual([]);
  });

  it("reports a class the design system does not have, rather than losing it on save", () => {
    expect(componentProblems(HERO, '<h2 class="title">{{heading}}</h2>')).toEqual([
      'class "title" is not kept on <h2>',
    ]);
  });

  it("reports a template tag the page would not keep", () => {
    expect(componentProblems([], "<marquee>{{x}}</marquee>")).toEqual([
      "<marquee> is not part of a page document, so only its contents would be kept",
      "{{x}} does not match any declared prop",
    ]);
  });

  it("reports a prop placed inside a tag, where escaping is not enough", () => {
    expect(componentProblems(HERO, '<a href="{{cta}}">Go</a>')).toEqual([
      "<a> has a {{prop}} inside the tag, and a prop can only be placed in text",
    ]);
  });

  it("reports a placeholder nothing declares", () => {
    expect(componentProblems(HERO, "<p>{{missing}}</p>")).toEqual([
      "{{missing}} does not match any declared prop",
    ]);
  });
});

describe("propValues", () => {
  it("uses the declared fallbacks until the page sets something", () => {
    expect(propValues(HERO)).toEqual({ heading: "Build faster", cta: "Get started" });
    expect(propValues(HERO, { heading: "Ship it" })).toEqual({
      heading: "Ship it",
      cta: "Get started",
    });
  });
});

describe("renderComponent", () => {
  it("fills the template with the values", () => {
    expect(renderComponent(HERO, TEMPLATE, { heading: "Ship it" })).toBe(
      '<h2>Ship it</h2><p>Ready?</p><a href="/signup">Get started</a>',
    );
  });

  it("escapes a value rather than letting it become markup", () => {
    const html = renderComponent(HERO, "<h2>{{heading}}</h2>", {
      heading: '<script>alert(1)</script>',
    });
    expect(html).toBe("<h2>&lt;script&gt;alert(1)&lt;/script&gt;</h2>");
  });

  it("renders nothing for a template that has not been checked", () => {
    expect(renderComponent(HERO, "<marquee>{{heading}}</marquee>")).toBe("");
    expect(renderComponent(HERO, "")).toBe("");
  });

  it("renders nothing when a prop would land in an attribute", () => {
    expect(renderComponent(HERO, '<a href="{{cta}}">Go</a>')).toBe("");
  });
});
