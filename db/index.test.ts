import { beforeEach, describe, expect, it, vi } from "vitest";

// A stand-in for the neon tagged template. It records the SQL text and the
// bound values separately, which is exactly the split that keeps a value out
// of the SQL, and answers with whatever the test queued.
const calls: { sql: string; values: unknown[] }[] = [];
let nextRows: Record<string, unknown>[] = [];

vi.mock("@neondatabase/serverless", () => ({
  neon: vi.fn(() => (strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push({ sql: strings.join("$?"), values });
    return Promise.resolve(nextRows);
  }),
}));

async function load() {
  vi.resetModules();
  return import("./index");
}

beforeEach(() => {
  calls.length = 0;
  nextRows = [];
  vi.stubEnv("DATABASE_URL", "postgres://stub");
});

describe("db", () => {
  it("fails with a pointer to the fix when DATABASE_URL is missing", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const { db } = await load();
    expect(() => db()).toThrow(/DATABASE_URL is not set/);
  });

  it("creates the client once and reuses it", async () => {
    const { neon } = await import("@neondatabase/serverless");
    const { db } = await load();
    vi.mocked(neon).mockClear();
    db();
    db();
    expect(neon).toHaveBeenCalledTimes(1);
  });
});

describe("getSpace", () => {
  it("binds the slug as a parameter rather than splicing it into the SQL", async () => {
    const { getSpace } = await load();
    const hostile = "x'; drop table spaces; --";
    await getSpace(hostile);
    expect(calls[0].values).toEqual([hostile]);
    expect(calls[0].sql).not.toContain(hostile);
  });

  it("returns null when no space matches", async () => {
    const { getSpace } = await load();
    expect(await getSpace("missing")).toBeNull();
  });

  it("returns the first row when one matches", async () => {
    nextRows = [{ id: "s1", slug: "docs" }];
    const { getSpace } = await load();
    expect(await getSpace("docs")).toEqual({ id: "s1", slug: "docs" });
  });
});

describe("authenticateMcpToken", () => {
  it("looks the token up by its hash and only among unrevoked rows", async () => {
    const { authenticateMcpToken } = await load();
    await authenticateMcpToken("abc123");
    expect(calls[0].values).toEqual(["abc123"]);
    expect(calls[0].sql).toMatch(/where token_hash = \$\? and revoked_at is null/);
  });

  it("gives one answer, null, for unknown and revoked tokens alike", async () => {
    const { authenticateMcpToken } = await load();
    expect(await authenticateMcpToken("unknown")).toBeNull();
  });

  it("returns the owning row for a live token", async () => {
    nextRows = [{ id: "t1", owner: "aathil", name: "laptop" }];
    const { authenticateMcpToken } = await load();
    expect(await authenticateMcpToken("live")).toEqual({ id: "t1", owner: "aathil", name: "laptop" });
  });
});

describe("pageHtml", () => {
  it("reads the html body of a saved page", async () => {
    const { pageHtml } = await load();
    expect(pageHtml({ html: "<p>Hi</p>" })).toBe("<p>Hi</p>");
  });

  it("treats the column default and anything malformed as empty", async () => {
    const { pageHtml } = await load();
    expect(pageHtml([])).toBe("");
    expect(pageHtml(null)).toBe("");
    expect(pageHtml({ html: 42 })).toBe("");
  });
});
