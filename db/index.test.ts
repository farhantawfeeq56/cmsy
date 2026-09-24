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

describe("setPageHtml", () => {
  it("binds the body and the page id rather than splicing either into the SQL", async () => {
    nextRows = [{ id: "p1" }];
    const { setPageHtml, LIMITS } = await load();
    const hostile = "</p><script>drop table pages</script>";

    expect(await setPageHtml("p1", hostile)).toBe(true);
    expect(calls[0].values).toEqual([JSON.stringify({ html: hostile }), "p1"]);
    expect(calls[0].sql).not.toContain(hostile);
    expect(LIMITS.pageBody).toBe(200_000);
  });

  it("caps the stored body at the shared limit, for every caller", async () => {
    nextRows = [{ id: "p1" }];
    const { setPageHtml, LIMITS } = await load();

    await setPageHtml("p1", "x".repeat(LIMITS.pageBody + 50));
    const stored = JSON.parse(calls[0].values[0] as string) as { html: string };
    expect(stored.html).toHaveLength(LIMITS.pageBody);
  });

  it("reports a page that is not there instead of claiming a save", async () => {
    const { setPageHtml } = await load();
    expect(await setPageHtml("missing", "<p>x</p>")).toBe(false);
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
