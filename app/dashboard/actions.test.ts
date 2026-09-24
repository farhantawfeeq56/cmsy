import { beforeEach, describe, expect, it, vi } from "vitest";

// Only the insert is replaced; slugify and the rest of the db module are real.
vi.mock("@/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db")>()),
  createSpace: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { createSpace: insertSpace } = await import("@/db");
const { redirect } = await import("next/navigation");
const { createSpace } = await import("./actions");

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
