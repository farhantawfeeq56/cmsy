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

describe("searchEverything", () => {
  it("escapes LIKE wildcards instead of letting a term match every row", async () => {
    const { searchEverything } = await load();
    await searchEverything("50%_off");
    expect(calls[0].values).toContain("%50\\%\\_off%");
  });

  it("does not query for a term too short to be useful", async () => {
    const { searchEverything } = await load();
    expect(await searchEverything(" a ")).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("bounds each kind separately, so a common term cannot truncate a whole group", async () => {
    const { searchEverything } = await load();
    await searchEverything("docs");

    // Three per-kind limits, and no fourth limit over the union.
    expect(calls[0].sql.match(/limit/gi)).toHaveLength(3);
    expect(calls[0].values).toEqual(["%docs%", 4, "%docs%", 4, "%docs%", 4]);
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

  it("counts the other spaces borrowing this space's design system, so delete can disclose them", async () => {
    const { getSpace } = await load();
    await getSpace("docs");

    // Borrowers are spaces other than this one pointing at a system this owns.
    expect(calls[0].sql).toMatch(/as design_system_borrowers/);
    expect(calls[0].sql).toMatch(/design_systems d where d\.space_id = s\.id/);
    expect(calls[0].sql).toMatch(/o\.id <> s\.id/);
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

const TEXT = (id: string, text: string) => ({ type: "Text", props: { id, text } });
const DOC = (...content: unknown[]) => ({ version: 2, root: { props: {} }, content });

describe("pageDoc", () => {
  it("reads a body in the block format as stored", async () => {
    const { pageDoc } = await load();
    const doc = DOC(TEXT("t1", "<p>Hi</p>"));
    expect(pageDoc(doc)).toEqual(doc);
  });

  it("converts a body saved before blocks", async () => {
    const { pageDoc } = await load();
    expect(pageDoc({ html: "<p>Hi</p>" }).content).toEqual([
      { type: "Text", props: { id: "legacy-text-0", text: "<p>Hi</p>" } },
    ]);
  });

  it("treats the column default and anything malformed as empty", async () => {
    const { pageDoc } = await load();
    for (const blocks of [[], null, { html: 42 }, "x"]) {
      expect(pageDoc(blocks).content).toEqual([]);
    }
  });
});

describe("setPageDoc", () => {
  it("binds the body and the page id rather than splicing either into the SQL", async () => {
    nextRows = [{ id: "p1" }];
    const { setPageDoc, LIMITS } = await load();
    const doc = DOC(TEXT("t1", "<p>drop table pages</p>"));

    expect(await setPageDoc("p1", doc)).toEqual({ saved: true });
    expect(calls[0].values).toEqual([JSON.stringify(doc), "p1"]);
    expect(calls[0].sql).not.toContain("drop table");
    expect(LIMITS.pageBody).toBe(200_000);
  });

  it("refuses a body with any problem, for every caller, and writes nothing", async () => {
    const { setPageDoc } = await load();
    const result = await setPageDoc("p1", DOC(TEXT("t1", "<p>ok</p><script>x</script>"), { type: "Marquee", props: { id: "m" } }));

    expect(result.saved).toBe(false);
    expect(result.saved ? [] : result.problems).toEqual(
      expect.arrayContaining([expect.stringContaining("<script>"), expect.stringContaining('"Marquee"')]),
    );
    expect(calls).toHaveLength(0);
  });

  it("refuses a body too long to store, rather than trimming it", async () => {
    const { setPageDoc, LIMITS } = await load();
    const long = Array.from({ length: 10 }, (_, i) => TEXT(`t${i}`, `<p>${"x".repeat(LIMITS.pageBody / 10)}</p>`));

    const result = await setPageDoc("p1", DOC(...long));
    expect(result.saved).toBe(false);
    expect(result.saved ? "" : result.problems[0]).toContain(String(LIMITS.pageBody));
    expect(calls).toHaveLength(0);
  });

  it("reports a page that is not there instead of claiming a save", async () => {
    const { setPageDoc } = await load();
    expect(await setPageDoc("missing", DOC())).toMatchObject({ saved: false });
  });
});

describe("slugify", () => {
  it("lowercases, hyphenates and trims the ends", async () => {
    const { slugify } = await load();
    expect(slugify("  Marketing Site! ")).toBe("marketing-site");
  });

  it("falls back to untitled when nothing survives", async () => {
    const { slugify } = await load();
    expect(slugify("!!!")).toBe("untitled");
  });
});

describe("insertWithSlug", () => {
  it("retries with a numeric suffix and reports the slug it used", async () => {
    const { insertWithSlug } = await load();
    const taken = new Set(["docs", "docs-2"]);
    const run = async (slug: string) => (taken.has(slug) ? [] : [{ id: `id-${slug}` }]);
    expect(await insertWithSlug(run, "docs")).toEqual({ id: "id-docs-3", slug: "docs-3" });
  });
});

describe("createSpace", () => {
  it("creates the space, seeds its design system from DESIGN.md and selects it", async () => {
    nextRows = [{ id: "s1" }];
    const { createSpace } = await load();
    expect(await createSpace("Docs")).toEqual({ id: "s1", slug: "docs" });

    expect(calls[0].sql).toMatch(/insert into spaces/);
    expect(calls[1].sql).toMatch(/insert into design_systems \(space_id, name, tokens\)/);
    expect(JSON.parse(calls[1].values[2] as string)).toHaveProperty("colors");
    expect(calls[2].sql).toMatch(/update spaces set design_system_id/);
  });
});

describe("space writes", () => {
  it("binds a new name rather than splicing it into the SQL, and leaves the slug", async () => {
    const hostile = "x'; drop table spaces; --";
    const { renameSpace } = await load();
    expect(await renameSpace("s1", hostile)).toBe(false);
    expect(calls[0].values).toEqual([hostile, "s1"]);
    expect(calls[0].sql).not.toContain(hostile);
    expect(calls[0].sql).not.toMatch(/slug/);
  });

  it("deletes one space by id — the children cascade in the schema", async () => {
    nextRows = [{ id: "s1" }];
    const { deleteSpace } = await load();
    expect(await deleteSpace("s1")).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toMatch(/delete from spaces where id = \$\?/);
  });
});

describe("page writes", () => {
  it("creates an empty page, as the column default has it, under a free slug", async () => {
    nextRows = [{ id: "p1" }];
    const { createPage } = await load();
    expect(await createPage("s1", "Pricing Plans")).toEqual({ saved: true, id: "p1", slug: "pricing-plans" });
    expect(calls[0].sql).toMatch(/on conflict \(space_id, slug\) do nothing/);
    expect(calls[0].values).toEqual(["s1", "Pricing Plans", "pricing-plans", "[]"]);
  });

  it("stores a body it was given, in the same insert", async () => {
    nextRows = [{ id: "p1" }];
    const { createPage } = await load();
    const body = DOC({ type: "Text", props: { id: "t1", text: "<p>Hi</p>" } });
    await createPage("s1", "Pricing", body);
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0].values[3] as string)).toEqual(body);
  });

  it("inserts nothing when the body has a problem", async () => {
    const { createPage } = await load();
    const result = await createPage("s1", "Pricing", DOC({ type: "Iframe", props: { id: "x" } }));
    expect(result).toMatchObject({ saved: false });
    expect(calls).toHaveLength(0);
  });

  it("reports null when no slug is free", async () => {
    const { createPage } = await load();
    expect(await createPage("s1", "Pricing")).toBeNull();
  });

  it("renames by id and deletes within the given space", async () => {
    const { renamePage, deletePage } = await load();
    expect(await renamePage("p1", "Plans")).toBe(false);
    expect(calls[0].sql).not.toMatch(/slug/);
    nextRows = [{ id: "p1" }];
    expect(await deletePage("s1", "p1")).toBe(true);
    expect(calls[1].sql).toMatch(/where id = \$\? and space_id = \$\?/);
  });
});

describe("component writes", () => {
  it("reports a taken name as null instead of inserting a duplicate", async () => {
    const { createComponent } = await load();
    expect(await createComponent("s1", "Hero", "")).toBeNull();
    expect(calls[0].sql).toMatch(/on conflict \(space_id, name\) do nothing/);
  });

  it("only imports from another space", async () => {
    const { importComponent } = await load();
    expect(await importComponent("s1", "c1")).toBeNull();
    expect(calls[0].sql).toMatch(/space_id <> \$\?/);
    expect(calls[0].values).toEqual(["s1", "c1", "s1"]);
  });

  it("deletes only within the given space and says whether anything went", async () => {
    const { deleteComponent } = await load();
    expect(await deleteComponent("s1", "c1")).toBe(false);
    expect(calls[0].sql).toMatch(/where id = \$\? and space_id = \$\?/);

    nextRows = [{ id: "c1" }];
    expect(await deleteComponent("s1", "c1")).toBe(true);
  });

  it("replaces both columns when both are given", async () => {
    const { updateComponent } = await load();
    const props = [{ key: "heading", label: "Heading", fallback: "Hi" }];
    await updateComponent("s1", "c1", props, "<h2>{{heading}}</h2>");

    expect(calls[0].sql).toMatch(/coalesce\(\$\?::jsonb, props\)/);
    expect(calls[0].values).toEqual([JSON.stringify(props), "<h2>{{heading}}</h2>", "c1", "s1"]);
  });

  it("binds null for a column the caller left alone, so it cannot be wiped", async () => {
    const { updateComponent } = await load();
    await updateComponent("s1", "c1", null, "<h2>Hi</h2>");

    expect(calls[0].values).toEqual([null, "<h2>Hi</h2>", "c1", "s1"]);
  });

  it("clears a column when the caller sends an empty value, not null", async () => {
    const { updateComponent } = await load();
    await updateComponent("s1", "c1", [], "");

    expect(calls[0].values).toEqual(["[]", "", "c1", "s1"]);
  });

  it("reads a component's declared props back with its name", async () => {
    const { findComponent } = await load();
    nextRows = [{ id: "c1", name: "Hero", props: [], template: "<h2>Hi</h2>" }];
    expect(await findComponent("s1", "Hero")).toMatchObject({ template: "<h2>Hi</h2>" });
    expect(calls[0].sql).toMatch(/select id, name, props, template from components/);
  });
});

describe("findConnectedAgent", () => {
  it("asks for one live, used token rather than reading the table", async () => {
    const { findConnectedAgent } = await load();
    nextRows = [{ name: "Claude", last_used_at: "2026-10-01T00:00:00Z" }];
    expect(await findConnectedAgent()).toEqual({ name: "Claude", last_used_at: "2026-10-01T00:00:00Z" });
    expect(calls[0].sql).toMatch(/revoked_at is null and last_used_at is not null/);
    expect(calls[0].sql).toMatch(/limit 1/);
  });

  it("is null when no agent has connected", async () => {
    const { findConnectedAgent } = await load();
    expect(await findConnectedAgent()).toBeNull();
  });
});

describe("slug-keyed listings", () => {
  it("bind the slug, so a page view need not wait for the space's id", async () => {
    const { listPagesInSpace, listComponentsInSpace } = await load();
    await listPagesInSpace("docs");
    await listComponentsInSpace("docs");
    expect(calls.map((c) => c.values)).toEqual([["docs"], ["docs"]]);
    for (const call of calls) expect(call.sql).toMatch(/where s\.slug = \$\?/);
  });
});
