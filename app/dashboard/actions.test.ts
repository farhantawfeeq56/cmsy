import { beforeEach, describe, expect, it, vi } from "vitest";

// Only the writes are replaced; slugify and the rest of the db module are real.
// The SQL each write runs is covered in `db/index.test.ts`.
vi.mock("@/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db")>()),
  createPage: vi.fn(),
  createSpace: vi.fn(),
  deletePage: vi.fn(),
  deleteSpace: vi.fn(),
  renamePage: vi.fn(),
  renameSpace: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const db = await import("@/db");
const { redirect } = await import("next/navigation");
const { createPage, createSpace, deletePage, deleteSpace, renamePage, renameSpace } = await import("./actions");

const ID = "483472dd-8c7d-4828-aee7-6131ad393dc3";
const SPACE_ID = "0b6f7d43-2f0e-4c1b-9d1e-5a7c3b2e1f00";

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("createSpace", () => {
  beforeEach(() => vi.clearAllMocks());

  it("redirects to the slug the space was saved under, not the one its name implies", async () => {
    // "docs" is taken, so the new space was saved as docs-2.
    vi.mocked(db.createSpace).mockResolvedValue({ id: "new-id", slug: "docs-2" });

    await createSpace(form({ name: "Docs" }));

    expect(db.createSpace).toHaveBeenCalledWith("Docs");
    expect(redirect).toHaveBeenCalledWith("/dashboard/docs-2");
  });

  it("does not redirect when no slug is free", async () => {
    vi.mocked(db.createSpace).mockResolvedValue(null);

    await createSpace(form({ name: "Docs" }));

    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("renameSpace", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renames by id through the shared helper", async () => {
    await renameSpace(form({ id: ID, name: " Renamed " }));
    expect(db.renameSpace).toHaveBeenCalledWith(ID, "Renamed");
  });

  it("refuses an id that is not a uuid, so a stray form cannot rename another space", async () => {
    await renameSpace(form({ id: "../other", name: "Renamed" }));
    expect(db.renameSpace).not.toHaveBeenCalled();
  });
});

describe("deleteSpace", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes one space by id and lands on the dashboard", async () => {
    await deleteSpace(form({ id: ID }));
    expect(db.deleteSpace).toHaveBeenCalledWith(ID);
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });

  it("deletes nothing without a uuid", async () => {
    await deleteSpace(form({ id: "not-an-id" }));
    expect(db.deleteSpace).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("pages", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a page through the same helper create_page uses, with no body", async () => {
    await createPage(form({ spaceId: SPACE_ID, title: "Pricing" }));
    expect(db.createPage).toHaveBeenCalledWith(SPACE_ID, "Pricing");
  });

  it("renames and deletes a page by id", async () => {
    await renamePage(form({ id: ID, title: "Plans" }));
    await deletePage(form({ id: ID, spaceId: SPACE_ID }));
    expect(db.renamePage).toHaveBeenCalledWith(ID, "Plans");
    expect(db.deletePage).toHaveBeenCalledWith(SPACE_ID, ID);
  });

  it("writes nothing for a blank title or a missing space", async () => {
    await createPage(form({ spaceId: SPACE_ID, title: "  " }));
    await deletePage(form({ id: ID }));
    expect(db.createPage).not.toHaveBeenCalled();
    expect(db.deletePage).not.toHaveBeenCalled();
  });
});
