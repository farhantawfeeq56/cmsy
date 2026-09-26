import { beforeEach, describe, expect, it, vi } from "vitest";

// Only the insert is replaced; slugify and the rest of the db module are real.
// `db` is stubbed too, so the queries an action builds can be inspected.
const queries: { sql: string; values: unknown[] }[] = [];

vi.mock("@/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db")>()),
  createSpace: vi.fn(),
  db: vi.fn(
    () =>
      (strings: TemplateStringsArray, ...values: unknown[]) => {
        queries.push({ sql: strings.join("$?"), values });
        return Promise.resolve([]);
      },
  ),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { createSpace: insertSpace } = await import("@/db");
const { redirect } = await import("next/navigation");
const { createSpace } = await import("./actions");
const { renameSpace } = await import("./actions");

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("createSpace", () => {
  beforeEach(() => vi.clearAllMocks());

  it("redirects to the slug the space was saved under, not the one its name implies", async () => {
    // "docs" is taken, so the new space was saved as docs-2.
    vi.mocked(insertSpace).mockResolvedValue({ id: "new-id", slug: "docs-2" });

    await createSpace(form({ name: "Docs" }));

    expect(insertSpace).toHaveBeenCalledWith("Docs");
    expect(redirect).toHaveBeenCalledWith("/dashboard/docs-2");
  });

  it("does not redirect when no slug is free", async () => {
    vi.mocked(insertSpace).mockResolvedValue(null);

    await createSpace(form({ name: "Docs" }));

    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("renameSpace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queries.length = 0;
  });

  it("binds the new name rather than splicing it into the SQL", async () => {
    const hostile = "x'; drop table spaces; --";

    await renameSpace(form({ id: "483472dd-8c7d-4828-aee7-6131ad393dc3", name: hostile }));

    expect(queries[0].values).toEqual([hostile, "483472dd-8c7d-4828-aee7-6131ad393dc3"]);
    expect(queries[0].sql).not.toContain(hostile);
  });

  it("refuses an id that is not a uuid, so a stray form cannot rename another space", async () => {
    await renameSpace(form({ id: "../other", name: "Renamed" }));

    expect(queries).toHaveLength(0);
  });
});
