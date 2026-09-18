import Link from "next/link";
import { listSpaces } from "@/db";
import { createSpace } from "./actions";

export default async function DashboardPage() {
  const spaces = await listSpaces();

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <header>
        <h1 className="font-primary text-4xl font-normal tracking-[-0.02em]">Spaces</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-smoke">
          A space owns its pages, its components, and its design system — and can
          import either from another space.
        </p>
      </header>

      <form action={createSpace} className="mt-8 flex flex-col gap-3 sm:flex-row">
        <input
          name="name"
          required
          maxLength={80}
          placeholder="New space name"
          aria-label="New space name"
          className="input sm:max-w-xs"
        />
        <button type="submit" className="btn shrink-0 justify-center">
          Create space
        </button>
      </form>

      {spaces.length === 0 ? (
        <p className="mt-10 rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-smoke">
          No spaces yet. Create one above to start adding pages and components.
        </p>
      ) : (
        <ul className="mt-10 grid gap-4 sm:grid-cols-2">
          {spaces.map((space) => (
            <li key={space.id}>
              <Link
                href={`/dashboard/${space.slug}`}
                className="card block transition-colors hover:border-ink/20"
              >
                <h2 className="font-primary text-xl font-medium tracking-tight">{space.name}</h2>
                <p className="mt-1 text-sm text-smoke">/{space.slug}</p>
                <p className="mt-4 flex flex-wrap gap-2">
                  <span className="badge badge-quiet">
                    {space.page_count} {space.page_count === 1 ? "page" : "pages"}
                  </span>
                  <span className="badge badge-quiet">
                    {space.component_count}{" "}
                    {space.component_count === 1 ? "component" : "components"}
                  </span>
                  <span className="badge">
                    {space.design_system_name ?? "No design system"}
                  </span>
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
