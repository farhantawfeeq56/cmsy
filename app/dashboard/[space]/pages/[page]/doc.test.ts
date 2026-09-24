import { describe, expect, it } from "vitest";
import { pageHtmlProblems } from "@/db/page-html";
import { componentBlock } from "./doc";

/**
 * A component's template is rendered into a page island, and that island is then
 * judged by the page's own allowlist. Both halves have their own tests; this is
 * the seam between them, and it is where the class allowance could have broken
 * `set_page_blocks` with neither half noticing: a template using `card` or `btn`
 * would pass the component checker, render, and then be reported as markup the
 * page strips — which is a save that quietly loses what was written.
 */
const PROPS = [
  { key: "heading", label: "Heading", fallback: "Pricing" },
  { key: "cta", label: "Button", fallback: "Get started" },
];

const TEMPLATE =
  '<h2>{{heading}}</h2><div class="card"><span class="badge">Popular</span>' +
  '<a class="btn" href="/signup">{{cta}}</a></div>';

describe("componentBlock", () => {
  it("builds an island the page checker accepts, design-system classes and all", () => {
    const island = componentBlock("5f0e1b1a-0000-4000-8000-000000000000", {
      id: "5f0e1b1a-0000-4000-8000-000000000001",
      name: "Pricing",
      props: PROPS,
      template: TEMPLATE,
    }, {});

    expect(pageHtmlProblems(island)).toEqual([]);
    expect(island).toContain('class="card"');
    expect(island).toContain('class="badge"');
    expect(island).toContain('class="btn"');
  });
});
