import { describe, expect, it } from "vitest";
import design from "../app/dashboard/[space]/design.generated.json";
import { checkTokens, TOKEN_LIMITS } from "./design-tokens";

describe("checkTokens", () => {
  it("accepts DESIGN.md's own tokens, which every new space starts with", () => {
    expect(checkTokens(design.tokens).problems).toEqual([]);
  });

  it("refuses anything that is not an object of groups", () => {
    for (const value of [null, [], "tokens", 3]) {
      expect(checkTokens(value).problems).toEqual(["tokens must be an object of groups"]);
    }
  });

  it("names an unknown group and a group that is not an object", () => {
    const { problems } = checkTokens({ shadows: {}, colors: "#000" });
    expect(problems).toContain('"shadows" is not a token group; use colors, typography, rounded, spacing, components');
    expect(problems).toContain("colors must be an object");
  });

  it("wants strings in a flat group and objects of strings in a nested one", () => {
    const { problems } = checkTokens({
      colors: { primary: 3 },
      typography: { h1: "Nohemi", h2: { fontSize: 28 } },
    });
    expect(problems).toEqual([
      "colors.primary must be a string",
      "typography.h1 must be an object of properties",
      "typography.h2.fontSize must be a string",
    ]);
  });

  it("refuses a name that would not survive as a reference", () => {
    const { problems } = checkTokens({ colors: { "on primary": "#fff" } });
    expect(problems[0]).toMatch(/colors\.on primary is not a token name/);
  });

  it("refuses a reference to a token the set does not define", () => {
    const { problems } = checkTokens({
      colors: { primary: "#111" },
      components: { button: { backgroundColor: "{colors.primary}", textColor: "{colors.ink}" } },
    });
    expect(problems).toEqual([
      "components.button.textColor refers to {colors.ink}, which this set does not define",
    ]);
  });

  it("bounds a value, a group and the whole set", () => {
    const long = "x".repeat(TOKEN_LIMITS.value + 1);
    expect(checkTokens({ colors: { primary: long } }).problems[0]).toMatch(/colors\.primary is 201 characters/);

    const many = Object.fromEntries(Array.from({ length: TOKEN_LIMITS.entries + 1 }, (_, i) => [`c${i}`, "#000"]));
    expect(checkTokens({ colors: many }).problems).toContain(`colors has 101 entries; a group holds ${TOKEN_LIMITS.entries}`);
  });
});
