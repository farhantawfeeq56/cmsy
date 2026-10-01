import { createMcpHandler } from "@modelcontextprotocol/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Every database function the tools call is replaced, so these tests exercise
// the real tool schemas, annotations and error handling with no database.
vi.mock("../db", () => ({
  LIMITS: { spaceName: 80, pageTitle: 120, componentName: 80, componentDescription: 300, pageBody: 200_000 },
  createComponent: vi.fn(),
  createPage: vi.fn(),
  createSpace: vi.fn(),
  deleteComponent: vi.fn(),
  deletePage: vi.fn(),
  deleteSpace: vi.fn(),
  findComponent: vi.fn(),
  getDesignSystem: vi.fn(),
  getPage: vi.fn(),
  getSpace: vi.fn(),
  importComponent: vi.fn(),
  listComponents: vi.fn(),
  listDesignSystems: vi.fn(),
  listImportable: vi.fn(),
  listPages: vi.fn(),
  listRecentActivity: vi.fn(),
  listSpaces: vi.fn(),
  renamePage: vi.fn(),
  renameSpace: vi.fn(),
  setDesignSystemTokens: vi.fn(),
  setPageDoc: vi.fn(),
  setSpaceDesignSystem: vi.fn(),
  updateComponent: vi.fn(),
}));

const db = await import("../db");
const { createCmsyMcpServer } = await import("./server");
const handler = createMcpHandler(createCmsyMcpServer);

const DOCS = { id: "s-docs", name: "Docs", slug: "docs", page_count: 2, component_count: 2, design_system_id: null, design_system_name: null, design_system_borrowers: 0 };
const SITE = { ...DOCS, id: "s-site", name: "Marketing site", slug: "marketing-site" };

type Result = { isError?: boolean; content: { text: string }[]; structuredContent?: Record<string, unknown> };

async function rpc(method: string, params: Record<string, unknown>) {
  const response = await handler.fetch(
    new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }),
  );
  const body = await response.text();
  const json = response.headers.get("content-type")?.includes("event-stream")
    ? body.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5)).join("")
    : body;
  return JSON.parse(json);
}

const call = async (name: string, args: Record<string, unknown>) =>
  (await rpc("tools/call", { name, arguments: args })).result as Result;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.getSpace).mockImplementation(async (slug) =>
    slug === "docs" ? DOCS : slug === "marketing-site" ? SITE : null,
  );
});

describe("tools/list", () => {
  it("marks reads read-only and only the writes that replace or delete destructive", async () => {
    const { tools } = (await rpc("tools/list", {})).result as {
      tools: { name: string; annotations: Record<string, boolean> }[];
    };
    const hints = Object.fromEntries(tools.map((t) => [t.name, t.annotations]));

    for (const read of ["get_space", "get_page", "list_importable", "list_recent_activity", "list_design_systems"]) {
      expect(hints[read].readOnlyHint).toBe(true);
    }
    for (const write of [
      "create_space",
      "rename_space",
      "create_page",
      "rename_page",
      "create_component",
      "update_component",
      "import_component",
      "use_design_system",
    ]) {
      expect(hints[write]).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    }
    for (const destructive of [
      "delete_component",
      "set_page_blocks",
      "delete_page",
      "delete_space",
      "set_design_system_tokens",
    ]) {
      expect(hints[destructive]).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    }
  });
});

describe("create_space", () => {
  it("returns the slug that was actually used, suffix included", async () => {
    vi.mocked(db.createSpace).mockResolvedValue({ id: "s-new", slug: "docs-2" });
    const result = await call("create_space", { name: "Docs" });
    expect(result.structuredContent).toEqual({ name: "Docs", slug: "docs-2", dashboardPath: "/dashboard/docs-2" });
  });

  it("rejects a blank name before touching the database", async () => {
    const result = await call("create_space", { name: "   " });
    expect(result.isError).toBe(true);
    expect(db.createSpace).not.toHaveBeenCalled();
  });
});

describe("create_component", () => {
  it("is a tool error for an unknown space, with no write", async () => {
    const result = await call("create_component", { space: "nope", name: "Hero" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/No space with slug "nope"/);
    expect(db.createComponent).not.toHaveBeenCalled();
  });

  it("says so when the name is taken rather than reporting success", async () => {
    vi.mocked(db.createComponent).mockResolvedValue(null);
    const result = await call("create_component", { space: "docs", name: "Sidebar" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/already has a component named "Sidebar"/);
  });

  it("defaults the description to empty", async () => {
    vi.mocked(db.createComponent).mockResolvedValue({ id: "c-new" });
    await call("create_component", { space: "docs", name: "Hero" });
    expect(db.createComponent).toHaveBeenCalledWith("s-docs", "Hero", "", [], "");
  });

  it("stores the props and template it was given", async () => {
    vi.mocked(db.createComponent).mockResolvedValue({ id: "c-new" });
    const props = [{ key: "heading", label: "Heading", fallback: "Hi" }];
    const result = await call("create_component", {
      space: "docs",
      name: "Hero",
      props,
      template: "<h2>{{heading}}</h2>",
    });
    expect(db.createComponent).toHaveBeenCalledWith("s-docs", "Hero", "", props, "<h2>{{heading}}</h2>");
    expect(result.structuredContent).toMatchObject({ declared: { props, template: "<h2>{{heading}}</h2>" } });
  });

  it("refuses a template the editor would strip rather than saving it", async () => {
    const result = await call("create_component", {
      space: "docs",
      name: "Hero",
      props: [{ key: "heading" }],
      template: '<h2 class="title">{{heading}}</h2>',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/class "title" is not kept on <h2>/);
    expect(db.createComponent).not.toHaveBeenCalled();
  });

  it("refuses a template that names a prop it did not declare", async () => {
    const result = await call("create_component", {
      space: "docs",
      name: "Hero",
      template: "<h2>{{heading}}</h2>",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/\{\{heading\}\} does not match any declared prop/);
  });

  it("refuses a prop the parser would drop instead of reporting success", async () => {
    const result = await call("create_component", {
      space: "docs",
      name: "Hero",
      props: [{ key: "not a key" }],
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/would be dropped/);
    expect(db.createComponent).not.toHaveBeenCalled();
  });
});

describe("update_component", () => {
  it("is a tool error for an unknown space, with no lookup", async () => {
    const result = await call("update_component", { space: "nope", component: "Hero" });
    expect(result.isError).toBe(true);
    expect(db.findComponent).not.toHaveBeenCalled();
  });

  it("asks for something to write when neither field is sent", async () => {
    const result = await call("update_component", { space: "docs", component: "Hero" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/nothing to update/);
    expect(db.updateComponent).not.toHaveBeenCalled();
  });

  it("says so when the component is not in that space", async () => {
    vi.mocked(db.findComponent).mockResolvedValue(null);
    const result = await call("update_component", { space: "docs", component: "Ghost", template: "<p>Hi</p>" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/no component named "Ghost"/);
    expect(db.updateComponent).not.toHaveBeenCalled();
  });

  it("writes only the template, leaving the stored props alone", async () => {
    vi.mocked(db.findComponent).mockResolvedValue({
      id: "c1",
      name: "Hero",
      props: [{ key: "heading", label: "Heading", fallback: "Hi" }],
      template: "<h2>{{heading}}</h2>",
    });
    vi.mocked(db.updateComponent).mockResolvedValue(true);

    const result = await call("update_component", {
      space: "docs",
      component: "Hero",
      template: "<h3>{{heading}}</h3>",
    });

    // `null` is what leaves the column as it is, so the props cannot be wiped.
    expect(db.updateComponent).toHaveBeenCalledWith("s-docs", "c1", null, "<h3>{{heading}}</h3>");
    expect(result.structuredContent).toMatchObject({
      declared: { props: [{ key: "heading", label: "Heading", fallback: "Hi" }], template: "<h3>{{heading}}</h3>" },
    });
  });

  it("judges a template sent alone against the props already stored", async () => {
    vi.mocked(db.findComponent).mockResolvedValue({
      id: "c1",
      name: "Hero",
      props: [{ key: "heading", label: "Heading", fallback: "Hi" }],
      template: "<h2>{{heading}}</h2>",
    });
    const result = await call("update_component", {
      space: "docs",
      component: "Hero",
      template: "<h2>{{subhead}}</h2>",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/\{\{subhead\}\} does not match any declared prop/);
    expect(db.updateComponent).not.toHaveBeenCalled();
  });

  it("replaces the props when they are sent, and reports them back", async () => {
    vi.mocked(db.findComponent).mockResolvedValue({ id: "c1", name: "Hero", props: [], template: "" });
    vi.mocked(db.updateComponent).mockResolvedValue(true);
    const props = [{ key: "heading", label: "", fallback: "" }];

    const result = await call("update_component", { space: "docs", component: "Hero", props });

    expect(db.updateComponent).toHaveBeenCalledWith("s-docs", "c1", [{ key: "heading", label: "heading", fallback: "" }], null);
    expect(result.structuredContent).toMatchObject({ declared: { props: [{ key: "heading", label: "heading", fallback: "" }] } });
  });

  it("refuses props that would orphan the stored template", async () => {
    vi.mocked(db.findComponent).mockResolvedValue({
      id: "c1",
      name: "Hero",
      props: [{ key: "heading", label: "Heading", fallback: "Hi" }],
      template: "<h2>{{heading}}</h2>",
    });

    // Renaming the prop without re-sending the template would leave it pointing
    // at a name nothing declares, so the component would stop rendering.
    const result = await call("update_component", {
      space: "docs",
      component: "Hero",
      props: [{ key: "title" }],
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/\{\{heading\}\} does not match any declared prop/);
    expect(db.updateComponent).not.toHaveBeenCalled();
  });

  it("reports a row that went away between the lookup and the write", async () => {
    vi.mocked(db.findComponent).mockResolvedValue({ id: "c1", name: "Hero", props: [], template: "" });
    vi.mocked(db.updateComponent).mockResolvedValue(false);

    const result = await call("update_component", { space: "docs", component: "Hero", template: "<p>Hi</p>" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/removed from Docs while this call was in flight/);
  });
});

describe("delete_component", () => {
  it("does not delete when the name is not in that space", async () => {
    vi.mocked(db.findComponent).mockResolvedValue(null);
    const result = await call("delete_component", { space: "docs", component: "Ghost" });
    expect(result.isError).toBe(true);
    expect(db.deleteComponent).not.toHaveBeenCalled();
  });

  it("deletes by the id the name resolves to, scoped to the space", async () => {
    vi.mocked(db.findComponent).mockResolvedValue({ id: "c1", name: "Sidebar", props: [], template: "" });
    vi.mocked(db.deleteComponent).mockResolvedValue(true);
    const result = await call("delete_component", { space: "docs", component: "Sidebar" });
    expect(result.isError).toBeFalsy();
    expect(db.deleteComponent).toHaveBeenCalledWith("s-docs", "c1");
  });
});

describe("import_component", () => {
  it("refuses an import into the same space without a lookup", async () => {
    const result = await call("import_component", { space: "docs", fromSpace: "docs", component: "Sidebar" });
    expect(result.isError).toBe(true);
    expect(db.getSpace).not.toHaveBeenCalled();
  });

  it("copies the source component's id into the target space", async () => {
    vi.mocked(db.findComponent).mockResolvedValue({ id: "c-hero", name: "Hero", props: [], template: "" });
    vi.mocked(db.importComponent).mockResolvedValue({ id: "c-copy", name: "Hero" });
    const result = await call("import_component", { space: "docs", fromSpace: "marketing-site", component: "Hero" });
    expect(db.findComponent).toHaveBeenCalledWith("s-site", "Hero");
    expect(db.importComponent).toHaveBeenCalledWith("s-docs", "c-hero");
    expect(result.structuredContent).toMatchObject({ component: { id: "c-copy", name: "Hero" } });
  });

  it("is a tool error when the target already has that name", async () => {
    vi.mocked(db.findComponent).mockResolvedValue({ id: "c-hero", name: "Hero", props: [], template: "" });
    vi.mocked(db.importComponent).mockResolvedValue(null);
    const result = await call("import_component", { space: "docs", fromSpace: "marketing-site", component: "Hero" });
    expect(result.isError).toBe(true);
  });
});

describe("list_recent_activity", () => {
  it("defaults to the dashboard's five items and caps the limit at 50", async () => {
    vi.mocked(db.listRecentActivity).mockResolvedValue([]);
    await call("list_recent_activity", {});
    expect(db.listRecentActivity).toHaveBeenCalledWith(5);

    const result = await call("list_recent_activity", { limit: 51 });
    expect(result.isError).toBe(true);
  });
});

const PRICING = { id: "p1", title: "Pricing", slug: "pricing", blocks: { html: "<p>Simple</p>" } };
const HERO = "5f0e1b1a-0000-4000-8000-000000000001";
const DOC = (...content: unknown[]) => ({ version: 2, root: { props: {} }, content });

// The write is replaced, but the rules it applies are the real, pure ones, so
// what a tool refuses here is what the database function would refuse.
beforeEach(async () => {
  const { checkPageDoc } = await import("../db/page-doc");
  vi.mocked(db.setPageDoc).mockImplementation(async (_id, value) => {
    const { problems } = checkPageDoc(value);
    return problems.length ? { saved: false, problems } : { saved: true };
  });
});

const SITE_SYSTEM = {
  id: "3f1c2a9e-8b7d-4c6e-9a5f-1e2d3c4b5a69",
  name: "Marketing site design system",
  tokens: { colors: { primary: "#000", ink: "#111" }, rounded: { md: "8px" } },
  owner_space_id: "s-site",
  owner_space_name: "Marketing site",
  owner_space_slug: "marketing-site",
};

describe("list_design_systems", () => {
  it("names the space that owns each system, and none for an orphan", async () => {
    vi.mocked(db.listDesignSystems).mockResolvedValue([
      { id: SITE_SYSTEM.id, name: SITE_SYSTEM.name, space_id: "s-site", space_name: "Marketing site", space_slug: "marketing-site", token_count: 3 },
      { id: "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a", name: "Orphan", space_id: null, space_name: null, space_slug: null, token_count: 0 },
    ]);
    const result = await call("list_design_systems", {});
    expect(result.structuredContent).toEqual({
      count: 2,
      designSystems: [
        { id: SITE_SYSTEM.id, name: SITE_SYSTEM.name, ownedBy: { name: "Marketing site", slug: "marketing-site" }, tokenCount: 3 },
        { id: "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a", name: "Orphan", ownedBy: null, tokenCount: 0 },
      ],
    });
  });
});

describe("use_design_system", () => {
  it("points the space at another space's system and says whose it is", async () => {
    vi.mocked(db.getDesignSystem).mockResolvedValue(SITE_SYSTEM);
    vi.mocked(db.setSpaceDesignSystem).mockResolvedValue(true);
    const result = await call("use_design_system", { space: "docs", designSystemId: SITE_SYSTEM.id });

    expect(db.setSpaceDesignSystem).toHaveBeenCalledWith("s-docs", SITE_SYSTEM.id);
    expect(result.content[0].text).toBe('Docs now uses "Marketing site design system", shared from Marketing site.');
    expect(result.structuredContent).toEqual({
      space: { name: "Docs", slug: "docs" },
      designSystem: {
        id: SITE_SYSTEM.id,
        name: SITE_SYSTEM.name,
        ownedBy: { name: "Marketing site", slug: "marketing-site" },
        tokenCount: 3,
      },
    });
  });

  it("refuses a system no row owns, with no write", async () => {
    vi.mocked(db.getDesignSystem).mockResolvedValue(null);
    const result = await call("use_design_system", { space: "docs", designSystemId: SITE_SYSTEM.id });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/No design system with id/);
    expect(db.setSpaceDesignSystem).not.toHaveBeenCalled();
  });

  it("is a tool error for an unknown space, with no lookup", async () => {
    const result = await call("use_design_system", { space: "nope", designSystemId: SITE_SYSTEM.id });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/No space with slug "nope"/);
    expect(db.getDesignSystem).not.toHaveBeenCalled();
  });

  it("rejects an id that is not a uuid before touching the database", async () => {
    const result = await call("use_design_system", { space: "docs", designSystemId: "marketing-site" });
    expect(result.isError).toBe(true);
    expect(db.getSpace).not.toHaveBeenCalled();
  });

  it("reports a system deleted between the lookup and the write", async () => {
    vi.mocked(db.getDesignSystem).mockResolvedValue(SITE_SYSTEM);
    vi.mocked(db.setSpaceDesignSystem).mockResolvedValue(false);
    const result = await call("use_design_system", { space: "docs", designSystemId: SITE_SYSTEM.id });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/no longer exists/);
  });
});

describe("get_page", () => {
  it("returns the stored body as blocks, converting one saved before blocks", async () => {
    vi.mocked(db.getPage).mockResolvedValue(PRICING);
    const result = await call("get_page", { space: "docs", page: "pricing" });

    expect(db.getPage).toHaveBeenCalledWith("s-docs", "pricing");
    expect(result.structuredContent).toMatchObject({
      space: { slug: "docs" },
      page: { title: "Pricing", slug: "pricing" },
      doc: DOC({ type: "Text", props: { id: "legacy-text-0", text: "<p>Simple</p>" } }),
    });
  });

  it("reads the column default as an empty body rather than failing", async () => {
    vi.mocked(db.getPage).mockResolvedValue({ ...PRICING, blocks: [] });
    const result = await call("get_page", { space: "docs", page: "pricing" });
    expect(result.structuredContent).toMatchObject({ doc: DOC() });
  });

  it("is a tool error for an unknown page, naming the space", async () => {
    vi.mocked(db.getPage).mockResolvedValue(null);
    const result = await call("get_page", { space: "docs", page: "nope" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("nope");
    expect(result.content[0].text).toContain("Docs");
  });

  it("does not look for a page in a space that does not exist", async () => {
    const result = await call("get_page", { space: "ghost", page: "pricing" });
    expect(result.isError).toBe(true);
    expect(db.getPage).not.toHaveBeenCalled();
  });
});

describe("set_page_blocks", () => {
  it("saves a body of blocks, nested ones included", async () => {
    vi.mocked(db.getPage).mockResolvedValue(PRICING);
    const doc = DOC(
      { type: "Text", props: { id: "t1", text: "<h2>Plans</h2><p>From $0.</p>" } },
      {
        type: "Columns",
        props: {
          id: "c1",
          left: [{ type: "Component", props: { id: "k1", componentId: HERO, values: { heading: "Hi" } } }],
          right: [{ type: "Image", props: { id: "i1", src: "/plan.png", alt: "" } }],
        },
      },
    );

    const result = await call("set_page_blocks", { space: "docs", page: "pricing", doc });

    expect(db.setPageDoc).toHaveBeenCalledWith("p1", doc);
    expect(result.structuredContent).toMatchObject({ blocks: 4, replaced: true });
  });

  it("refuses a hostile body whole, with the reasons", async () => {
    vi.mocked(db.getPage).mockResolvedValue(PRICING);
    const result = await call("set_page_blocks", {
      space: "docs",
      page: "pricing",
      doc: DOC(
        { type: "Text", props: { id: "t1", text: "<p>ok</p><script>alert(1)</script>" } },
        { type: "Iframe", props: { id: "x1" } },
        { type: "Image", props: { id: "i1", src: "javascript:alert(1)", alt: 3 } },
      ),
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("nothing was saved");
    expect(result.content[0].text).toContain("<script>");
    expect(result.content[0].text).toContain('"Iframe" is not a block type');
    expect(result.content[0].text).toContain("src is not a safe link");
    expect(result.content[0].text).toContain("alt must be a string");
  });

  it("accepts the body get_page just returned, so a read-write round trip holds", async () => {
    const stored =
      '<p>Intro</p><div data-block="component" data-block-id="5f0e1b1a-0000-4000-8000-000000000000" data-component-id="5f0e1b1a-0000-4000-8000-000000000001" data-name="Hero" data-values="{&quot;heading&quot;:&quot;Hi&quot;}" contenteditable="false" class="comp-block"><span data-block-name class="badge">Hero</span></div>';
    vi.mocked(db.getPage).mockResolvedValue({ ...PRICING, blocks: { html: stored } });

    const read = await call("get_page", { space: "docs", page: "pricing" });
    const doc = (read.structuredContent as { doc: Record<string, unknown> }).doc;
    const result = await call("set_page_blocks", { space: "docs", page: "pricing", doc });

    expect(result.isError).toBeUndefined();
    expect(db.setPageDoc).toHaveBeenCalledWith("p1", doc);
    expect(result.structuredContent).toMatchObject({ blocks: 2 });
  });

  it("still takes a body as html, converted to blocks and checked the same way", async () => {
    vi.mocked(db.getPage).mockResolvedValue(PRICING);

    const saved = await call("set_page_blocks", { space: "docs", page: "pricing", html: "<p>Hi</p>" });
    expect(saved.isError).toBeUndefined();
    expect(db.setPageDoc).toHaveBeenCalledWith(
      "p1",
      DOC({ type: "Text", props: { id: "legacy-text-0", text: "<p>Hi</p>" } }),
    );

    const refused = await call("set_page_blocks", { space: "docs", page: "pricing", html: "<p onclick=x>Hi</p>" });
    expect(refused.isError).toBe(true);
    expect(refused.content[0].text).toContain("onclick");
  });

  it("asks for exactly one of doc and html", async () => {
    for (const body of [{}, { doc: DOC(), html: "<p>x</p>" }]) {
      const result = await call("set_page_blocks", { space: "docs", page: "pricing", ...body });
      expect(result.isError).toBe(true);
    }
    expect(db.setPageDoc).not.toHaveBeenCalled();
  });

  it("does not write to a page that does not exist", async () => {
    vi.mocked(db.getPage).mockResolvedValue(null);
    const result = await call("set_page_blocks", { space: "docs", page: "nope", doc: DOC() });
    expect(result.isError).toBe(true);
    expect(db.setPageDoc).not.toHaveBeenCalled();
  });
});

describe("create_page", () => {
  // The insert is replaced, but the body is judged by the real rules, as
  // `createPage` judges it, so a refusal here is one the database would make.
  beforeEach(async () => {
    const { checkPageDoc } = await import("../db/page-doc");
    vi.mocked(db.createPage).mockImplementation(async (_space, title, body) => {
      if (body !== undefined) {
        const { problems } = checkPageDoc(body);
        if (problems.length) return { saved: false, problems };
      }
      return { saved: true, id: "p-new", slug: title === "Pricing" ? "pricing-2" : "page" };
    });
  });

  it("returns the slug that was actually used, suffix included", async () => {
    const result = await call("create_page", { space: "docs", title: "Pricing" });
    expect(db.createPage).toHaveBeenCalledWith("s-docs", "Pricing", undefined);
    expect(result.structuredContent).toEqual({
      space: { name: "Docs", slug: "docs" },
      page: { id: "p-new", title: "Pricing", slug: "pricing-2" },
      blocks: 0,
      dashboardPath: "/dashboard/docs/pages/pricing-2",
    });
  });

  it("creates the page with the body it was given, as blocks or as html", async () => {
    const doc = DOC({ type: "Text", props: { id: "t1", text: "<p>Hi</p>" } });
    const result = await call("create_page", { space: "docs", title: "Pricing", doc });
    expect(db.createPage).toHaveBeenCalledWith("s-docs", "Pricing", doc);
    expect(result.structuredContent).toMatchObject({ blocks: 1 });

    await call("create_page", { space: "docs", title: "Pricing", html: "<p>Hi</p>" });
    expect(db.createPage).toHaveBeenLastCalledWith(
      "s-docs",
      "Pricing",
      DOC({ type: "Text", props: { id: "legacy-text-0", text: "<p>Hi</p>" } }),
    );
  });

  it("refuses a body the editor cannot keep in set_page_blocks' words, creating nothing", async () => {
    const result = await call("create_page", {
      space: "docs",
      title: "Pricing",
      doc: DOC({ type: "Iframe", props: { id: "x1" } }),
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/^The editor cannot keep all of that, so nothing was saved:/);
    expect(result.content[0].text).toContain('"Iframe" is not a block type');
    expect(result.structuredContent).toBeUndefined();
  });

  it("refuses both doc and html before touching the database", async () => {
    const result = await call("create_page", { space: "docs", title: "Pricing", doc: DOC(), html: "<p>x</p>" });
    expect(result.isError).toBe(true);
    expect(db.getSpace).not.toHaveBeenCalled();
  });

  it("is a tool error for an unknown space or a blank title, with no write", async () => {
    expect((await call("create_page", { space: "nope", title: "Pricing" })).isError).toBe(true);
    expect((await call("create_page", { space: "docs", title: "  " })).isError).toBe(true);
    expect(db.createPage).not.toHaveBeenCalled();
  });

  it("says so when no slug is free", async () => {
    vi.mocked(db.createPage).mockResolvedValue(null);
    const result = await call("create_page", { space: "docs", title: "Pricing" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/free slug/);
  });
});

describe("rename_page", () => {
  it("renames by the id the slug resolves to and keeps the slug", async () => {
    vi.mocked(db.getPage).mockResolvedValue(PRICING);
    vi.mocked(db.renamePage).mockResolvedValue(true);
    const result = await call("rename_page", { space: "docs", page: "pricing", title: "Plans" });
    expect(db.renamePage).toHaveBeenCalledWith("p1", "Plans");
    expect(result.structuredContent).toEqual({
      space: { name: "Docs", slug: "docs" },
      page: { id: "p1", title: "Plans", slug: "pricing" },
      previousTitle: "Pricing",
    });
  });

  it("is pageNotFound for an unknown page, with no write", async () => {
    vi.mocked(db.getPage).mockResolvedValue(null);
    const result = await call("rename_page", { space: "docs", page: "nope", title: "Plans" });
    expect(result.content[0].text).toBe('No page with slug "nope" in Docs. Call list_pages to see the slugs that exist.');
    expect(db.renamePage).not.toHaveBeenCalled();
  });
});

describe("delete_page", () => {
  it("deletes by the id the slug resolves to, scoped to the space", async () => {
    vi.mocked(db.getPage).mockResolvedValue(PRICING);
    vi.mocked(db.deletePage).mockResolvedValue(true);
    const result = await call("delete_page", { space: "docs", page: "pricing" });
    expect(db.deletePage).toHaveBeenCalledWith("s-docs", "p1");
    expect(result.content[0].text).toBe("Deleted Pricing (pricing) from Docs.");
  });

  it("reports a page that went away before the delete rather than claiming it", async () => {
    vi.mocked(db.getPage).mockResolvedValue(PRICING);
    vi.mocked(db.deletePage).mockResolvedValue(false);
    const result = await call("delete_page", { space: "docs", page: "pricing" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/No page with slug "pricing" in Docs/);
  });

  it("does not look for a page in a space that does not exist", async () => {
    const result = await call("delete_page", { space: "ghost", page: "pricing" });
    expect(result.isError).toBe(true);
    expect(db.getPage).not.toHaveBeenCalled();
  });
});

describe("rename_space", () => {
  it("renames the space and reports the slug unchanged", async () => {
    vi.mocked(db.renameSpace).mockResolvedValue(true);
    const result = await call("rename_space", { space: "docs", name: "Handbook" });
    expect(db.renameSpace).toHaveBeenCalledWith("s-docs", "Handbook");
    expect(result.structuredContent).toEqual({ name: "Handbook", slug: "docs", previousName: "Docs" });
  });

  it("is spaceNotFound for an unknown slug, with no write", async () => {
    const result = await call("rename_space", { space: "nope", name: "Handbook" });
    expect(result.content[0].text).toBe('No space with slug "nope". Call list_spaces to see the slugs that exist.');
    expect(db.renameSpace).not.toHaveBeenCalled();
  });
});

describe("delete_space", () => {
  it("says what went with it, including spaces left without a design system", async () => {
    vi.mocked(db.getSpace).mockResolvedValue({ ...DOCS, design_system_borrowers: 1 });
    vi.mocked(db.deleteSpace).mockResolvedValue(true);
    const result = await call("delete_space", { space: "docs", confirmPageCount: 2 });
    expect(db.deleteSpace).toHaveBeenCalledWith("s-docs");
    expect(result.structuredContent).toEqual({
      name: "Docs",
      slug: "docs",
      deletedPages: 2,
      deletedComponents: 2,
      spacesLeftWithoutDesignSystem: 1,
    });
    expect(result.content[0].text).toMatch(/1 other space\(s\) used its design system and now have none/);
  });

  it("is spaceNotFound for an unknown slug, with no write", async () => {
    const result = await call("delete_space", { space: "nope", confirmPageCount: 0 });
    expect(result.isError).toBe(true);
    expect(db.deleteSpace).not.toHaveBeenCalled();
  });

  it("deletes nothing when the page count does not match, and does not reveal it", async () => {
    const result = await call("delete_space", { space: "docs", confirmPageCount: 3 });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/confirmPageCount does not match Docs \(docs\), so nothing was deleted/);
    expect(result.content[0].text).not.toMatch(/\b2\b/);
    expect(db.deleteSpace).not.toHaveBeenCalled();
  });

  it("requires the count rather than treating it as optional", async () => {
    const result = await call("delete_space", { space: "docs" });
    expect(result.isError).toBe(true);
    expect(db.getSpace).not.toHaveBeenCalled();
    expect(db.deleteSpace).not.toHaveBeenCalled();
  });
});

describe("set_design_system_tokens", () => {
  const SITE_OWN = { ...SITE, design_system_id: SITE_SYSTEM.id, design_system_borrowers: 1 };
  const DOCS_BORROWING = { ...DOCS, design_system_id: SITE_SYSTEM.id };
  const TOKENS = { colors: { primary: "#222" }, components: { card: { backgroundColor: "{colors.primary}" } } };

  // The write is replaced, but the set is judged by the real checker.
  beforeEach(async () => {
    const { checkTokens } = await import("../db/design-tokens");
    vi.mocked(db.setDesignSystemTokens).mockImplementation(async (_id, value) => {
      const { problems } = checkTokens(value);
      return problems.length ? { saved: false, problems } : { saved: true };
    });
    vi.mocked(db.getDesignSystem).mockResolvedValue(SITE_SYSTEM);
    vi.mocked(db.getSpace).mockImplementation(async (slug) =>
      slug === "marketing-site" ? SITE_OWN : slug === "docs" ? DOCS_BORROWING : null,
    );
  });

  it("replaces the tokens of the system the space owns, and says who else changed", async () => {
    const result = await call("set_design_system_tokens", { space: "marketing-site", tokens: TOKENS });
    expect(db.setDesignSystemTokens).toHaveBeenCalledWith(SITE_SYSTEM.id, TOKENS);
    expect(result.content[0].text).toBe(
      'Saved 2 tokens to "Marketing site design system". 1 other space(s) use it and changed too.',
    );
    expect(result.structuredContent).toEqual({
      space: { name: "Marketing site", slug: "marketing-site" },
      designSystem: { id: SITE_SYSTEM.id, name: SITE_SYSTEM.name, tokenCount: 2 },
      alsoUsedBy: 1,
    });
  });

  it("refuses a set with problems whole, listing every one", async () => {
    const result = await call("set_design_system_tokens", {
      space: "marketing-site",
      tokens: { shadows: {}, components: { card: { textColor: "{colors.ink}" } } },
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/^Nothing was saved:/);
    expect(result.content[0].text).toContain('"shadows" is not a token group');
    expect(result.content[0].text).toContain("refers to {colors.ink}");
  });

  it("will not edit another space's system from a space that only uses it", async () => {
    const result = await call("set_design_system_tokens", { space: "docs", tokens: TOKENS });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Call this with space "marketing-site"/);
    expect(db.setDesignSystemTokens).not.toHaveBeenCalled();
  });

  it("is a tool error for a space with no design system, or no space", async () => {
    vi.mocked(db.getSpace).mockImplementation(async (slug) => (slug === "docs" ? DOCS : null));
    expect((await call("set_design_system_tokens", { space: "docs", tokens: TOKENS })).content[0].text).toMatch(
      /no design system selected/,
    );
    expect((await call("set_design_system_tokens", { space: "nope", tokens: TOKENS })).isError).toBe(true);
    expect(db.setDesignSystemTokens).not.toHaveBeenCalled();
  });
});

describe("credentials", () => {
  it("offers no tool that mints or revokes MCP tokens", async () => {
    const { tools } = (await rpc("tools/list", {})).result as { tools: { name: string }[] };
    expect(tools.map((t) => t.name).filter((name) => /mcp|credential|auth/i.test(name))).toEqual([]);
  });
});
