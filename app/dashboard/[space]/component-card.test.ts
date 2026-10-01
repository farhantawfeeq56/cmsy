import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ComponentCard } from "./component-card";

const component = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  name: "Card",
  description: "A card.",
  props: [{ key: "heading", label: "Heading", fallback: "Hi" }],
  template: "<h2>{{heading}}</h2>",
  origin_name: null,
  origin_space_name: null,
  ...over,
});

describe("ComponentCard", () => {
  it("renders the card with its name and a live preview", () => {
    const html = renderToString(createElement(ComponentCard, { component: component() }));
    expect(html).toContain("Card");
    expect(html).toContain("<h2>Hi</h2>");
  });

  // The overlay is client-only state, so the server render must carry the card
  // and nothing of the dialog.
  it("keeps the overlay closed until it is opened", () => {
    const html = renderToString(createElement(ComponentCard, { component: component() }));
    expect(html).not.toContain('role="dialog"');
  });

  it("says so when the component declares no props", () => {
    const html = renderToString(
      createElement(ComponentCard, { component: component({ props: [], template: "" }) }),
    );
    expect(html).toContain("Card");
    expect(html).not.toContain('role="dialog"');
  });

  it("marks an imported component", () => {
    const html = renderToString(
      createElement(ComponentCard, {
        component: component({ origin_name: "Badge", origin_space_name: "Docs" }),
      }),
    );
    expect(html).toContain("Imported");
    expect(html).toContain("Badge");
  });
});
