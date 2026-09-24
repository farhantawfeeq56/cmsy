import { createMcpHandler } from "@modelcontextprotocol/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Every database function the tools call is replaced, so these tests exercise
// the real tool schemas, annotations and error handling with no database.
vi.mock("../db", () => ({
  LIMITS: { spaceName: 80, componentName: 80, componentDescription: 300 },
  createComponent: vi.fn(),
  createSpace: vi.fn(),
  deleteComponent: vi.fn(),
  findComponent: vi.fn(),
  getDesignSystem: vi.fn(),
  getSpace: vi.fn(),
  importComponent: vi.fn(),
  listComponents: vi.fn(),
  listImportable: vi.fn(),
  listPages: vi.fn(),
  listRecentActivity: vi.fn(),
  listSpaces: vi.fn(),
}));

const db = await import("../db");
const { createCmsyMcpServer } = await import("./server");
const handler = createMcpHandler(createCmsyMcpServer);

const DOCS = { id: "s-docs", name: "Docs", slug: "docs", page_count: 2, component_count: 2, design_system_id: null, design_system_name: null };
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
  // getSpace is typed as never returning null, but it does for an unknown slug.
  vi.mocked(db.getSpace).mockImplementation(
    async (slug) => (slug === "docs" ? DOCS : slug === "marketing-site" ? SITE : null) as typeof DOCS,
  );
});

describe("tools/list", () => {
  it("marks reads read-only and only the delete destructive", async () => {
    const { tools } = (await rpc("tools/list", {})).result as {
      tools: { name: string; annotations: Record<string, boolean> }[];
    };
    const hints = Object.fromEntries(tools.map((t) => [t.name, t.annotations]));

    for (const read of ["get_space", "list_importable", "list_recent_activity"]) {
      expect(hints[read].readOnlyHint).toBe(true);
    }
    for (const write of ["create_space", "create_component", "import_component"]) {
      expect(hints[write]).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    }
    expect(hints.delete_component).toMatchObject({ readOnlyHint: false, destructiveHint: true });
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
    expect(db.createComponent).toHaveBeenCalledWith("s-docs", "Hero", "");
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
    vi.mocked(db.findComponent).mockResolvedValue({ id: "c1", name: "Sidebar" });
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
    vi.mocked(db.findComponent).mockResolvedValue({ id: "c-hero", name: "Hero" });
    vi.mocked(db.importComponent).mockResolvedValue({ id: "c-copy", name: "Hero" });
    const result = await call("import_component", { space: "docs", fromSpace: "marketing-site", component: "Hero" });
    expect(db.findComponent).toHaveBeenCalledWith("s-site", "Hero");
    expect(db.importComponent).toHaveBeenCalledWith("s-docs", "c-hero");
    expect(result.structuredContent).toMatchObject({ component: { id: "c-copy", name: "Hero" } });
  });

  it("is a tool error when the target already has that name", async () => {
    vi.mocked(db.findComponent).mockResolvedValue({ id: "c-hero", name: "Hero" });
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
