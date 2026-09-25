import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { driftFrom, laneVerdict, ownersFor, parseCodeowners } from "./protection.mjs";

const rules = parseCodeowners(readFileSync(".github/CODEOWNERS", "utf8"));
const HEAD = "head-sha";

function review(login: string, state: string, extra: Record<string, unknown> = {}) {
  return {
    user: { login, type: "User" },
    state,
    body: "Checked the rule wording against the ruleset.",
    commit_id: HEAD,
    submitted_at: "2026-09-24T15:00:00Z",
    ...extra,
  };
}

const verdict = (files: string[], reviews: object[], author = "farhantawfeeq56") =>
  laneVerdict({ author, headSha: HEAD, files, reviews, rules });

describe("parseCodeowners", () => {
  it("reads the checked-in file, with both devs on every line", () => {
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) expect(rule.owners).toEqual(["aathilfelix", "farhantawfeeq56"]);
  });

  it("rejects patterns it cannot match exactly as GitHub would", () => {
    expect(() => parseCodeowners("*.ts @a")).toThrow(/anchored/);
    expect(() => parseCodeowners("/db/*.sql @a")).toThrow(/anchored/);
    expect(() => parseCodeowners("db/schema.sql @a")).toThrow(/anchored/);
    expect(() => parseCodeowners("/AGENTS.md")).toThrow(/no owners/);
  });
});

describe("ownersFor", () => {
  it("puts the rules, the schema, auth and deploy config in the human lane", () => {
    for (const file of [
      "AGENTS.md",
      ".github/CODEOWNERS",
      ".github/workflows/ci.yml",
      ".github/rulesets/main-protection.json",
      "scripts/protection.mjs",
      "db/schema.sql",
      "mcp/tokens.ts",
      "app/api/mcp/route.ts",
      "wrangler.jsonc",
      "package.json",
    ]) {
      expect(ownersFor(rules, file), file).not.toEqual([]);
    }
  });

  it("leaves app code, tests and other docs in the fast lane", () => {
    for (const file of ["app/dashboard/actions.ts", "db/index.ts", "mcp/server.ts", "README.md", "scripts/pr-overlap.mjs"]) {
      expect(ownersFor(rules, file), file).toEqual([]);
    }
  });

  it("does not treat a file that merely starts with a guarded name as guarded", () => {
    expect(ownersFor(rules, "AGENTS.md.bak")).toEqual([]);
    expect(ownersFor(rules, "package.json5")).toEqual([]);
  });

  it("lets the last matching line win", () => {
    const layered = parseCodeowners("/db/ @a\n/db/schema.sql @b");
    expect(ownersFor(layered, "db/schema.sql")).toEqual(["b"]);
    expect(ownersFor(layered, "db/index.ts")).toEqual(["a"]);
  });
});

describe("laneVerdict", () => {
  it("passes a fast-lane PR with no reviews at all", () => {
    expect(verdict(["app/dashboard/page.tsx"], [])).toMatchObject({ lane: "fast", ok: true });
  });

  it("blocks a fast-lane PR while a change request stands", () => {
    const result = verdict(["app/dashboard/page.tsx"], [review("AathilFelix", "CHANGES_REQUESTED")]);
    expect(result).toMatchObject({ lane: "fast", ok: false });
    expect(result.problems[0]).toMatch(/@aathilfelix has requested changes/);
  });

  it("fails a human-lane PR with no approval", () => {
    expect(verdict(["AGENTS.md", "app/x.ts"], [])).toMatchObject({ lane: "human", guarded: ["AGENTS.md"], ok: false });
  });

  it("passes a human-lane PR the other dev approved on the head commit with a note", () => {
    expect(verdict(["AGENTS.md"], [review("AathilFelix", "APPROVED")])).toMatchObject({ lane: "human", ok: true });
  });

  it("does not count the author's own approval", () => {
    expect(verdict(["AGENTS.md"], [review("farhantawfeeq56", "APPROVED")]).ok).toBe(false);
  });

  it("does not count an approval with an empty body", () => {
    expect(verdict(["AGENTS.md"], [review("AathilFelix", "APPROVED", { body: "  " })]).ok).toBe(false);
  });

  it("does not count an approval of an older commit", () => {
    expect(verdict(["AGENTS.md"], [review("AathilFelix", "APPROVED", { commit_id: "old-sha" })]).ok).toBe(false);
  });

  it("does not count a bot, or someone who is not a code owner", () => {
    const bot = review("github-actions", "APPROVED", { user: { login: "github-actions", type: "Bot" } });
    expect(verdict(["AGENTS.md"], [bot, review("someone-else", "APPROVED")]).ok).toBe(false);
  });

  it("ignores a change request from outside the team, since the repo is public", () => {
    expect(verdict(["app/dashboard/page.tsx"], [review("drive-by-stranger", "CHANGES_REQUESTED")]).ok).toBe(true);
    const bot = review("github-actions", "CHANGES_REQUESTED", { user: { login: "github-actions", type: "Bot" } });
    expect(verdict(["app/dashboard/page.tsx"], [bot]).ok).toBe(true);
  });

  it("uses each reviewer's latest decision, and a comment does not cancel it", () => {
    const approvedThenComment = [
      review("AathilFelix", "APPROVED", { submitted_at: "2026-09-24T15:00:00Z" }),
      review("AathilFelix", "COMMENTED", { submitted_at: "2026-09-24T15:05:00Z", body: "one more thought" }),
    ];
    expect(verdict(["AGENTS.md"], approvedThenComment).ok).toBe(true);

    const blockedThenApproved = [
      review("AathilFelix", "CHANGES_REQUESTED", { submitted_at: "2026-09-24T15:00:00Z" }),
      review("AathilFelix", "APPROVED", { submitted_at: "2026-09-24T15:10:00Z" }),
    ];
    expect(verdict(["AGENTS.md"], blockedThenApproved).ok).toBe(true);

    const approvedThenDismissed = [
      review("AathilFelix", "APPROVED", { submitted_at: "2026-09-24T15:00:00Z" }),
      review("AathilFelix", "DISMISSED", { submitted_at: "2026-09-24T15:10:00Z" }),
    ];
    expect(verdict(["AGENTS.md"], approvedThenDismissed).ok).toBe(false);
  });

  it("ignores a review that has not been submitted yet", () => {
    expect(verdict(["AGENTS.md"], [review("AathilFelix", "APPROVED", { submitted_at: null })]).ok).toBe(false);
  });

  it("applies the same rule when Aathil is the author", () => {
    expect(verdict(["AGENTS.md"], [review("farhantawfeeq56", "APPROVED")], "AathilFelix").ok).toBe(true);
    expect(verdict(["AGENTS.md"], [review("AathilFelix", "APPROVED")], "AathilFelix").ok).toBe(false);
  });
});

describe("driftFrom", () => {
  const spec = JSON.parse(readFileSync(".github/rulesets/main-protection.json", "utf8"));
  // What GET /rules/branches/main returns once the spec is applied: the same
  // rules, parameters GitHub added on top, and arrays in any order.
  const applied = spec.rules.map((rule: { type: string; parameters?: Record<string, unknown> }) => {
    if (!rule.parameters) return { type: rule.type, ruleset_id: 1 };
    const parameters: Record<string, unknown> = { ...rule.parameters, added_by_github_later: true };
    for (const [key, value] of Object.entries(parameters)) {
      if (Array.isArray(value)) parameters[key] = [...value].reverse();
    }
    return { type: rule.type, parameters, ruleset_id: 1 };
  });

  it("finds nothing when main matches the spec", () => {
    expect(driftFrom(spec, applied, "active")).toEqual([]);
  });

  it("reports the ruleset being disabled", () => {
    expect(driftFrom(spec, applied, "disabled")).toEqual([expect.stringMatching(/enforcement is "disabled"/)]);
    expect(driftFrom(spec, applied, undefined)).toEqual([expect.stringMatching(/enforcement is unset/)]);
  });

  it("reports code-owner review being turned on", () => {
    const live = structuredClone(applied);
    live.find((r: { type: string }) => r.type === "pull_request").parameters.require_code_owner_review = true;
    expect(driftFrom(spec, live, "active")).toEqual([
      "pull_request: require_code_owner_review is true, spec says false",
    ]);
  });

  it("reports a rule the spec does not have", () => {
    const live = structuredClone(applied);
    live.push({ type: "required_signatures", ruleset_id: 1 });
    expect(driftFrom(spec, live, "active")).toEqual([
      "required_signatures: enforced on main but not in the spec",
    ]);
  });

  it("reports a whole spec rule missing", () => {
    const live = applied.filter((r: { type: string }) => r.type !== "non_fast_forward");
    expect(driftFrom(spec, live, "active")).toEqual(["non_fast_forward: missing on main"]);
  });

  it("matches main as it is today, so main is not drifted (#85, #86)", () => {
    const today = [
      { type: "deletion" },
      { type: "non_fast_forward" },
      {
        type: "pull_request",
        parameters: {
          required_approving_review_count: 0,
          dismiss_stale_reviews_on_push: false,
          require_code_owner_review: false,
          require_last_push_approval: false,
          required_review_thread_resolution: false,
          allowed_merge_methods: ["merge", "squash", "rebase"],
        },
      },
    ];
    expect(driftFrom(spec, today, "active")).toEqual([]);
  });
});
