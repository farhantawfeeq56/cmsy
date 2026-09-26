import Link from "next/link";
import { listRecentActivity, listSpaces, type ActivityItem } from "@/db";
import { ago } from "./ago";
import { createSpace } from "./actions";
import { SpaceRail } from "./space-rail";

const TILES = ["bg-mint", "bg-butter", "bg-lilac"];

const KIND_LABEL: Record<ActivityItem["kind"], string> = {
  page: "Page created",
  component: "Component created",
};

const initial = (value: string) => value.trim().charAt(0).toUpperCase() || "?";

export default async function DashboardPage() {
  const [spaces, activity] = await Promise.all([listSpaces(), listRecentActivity()]);

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="font-primary text-4xl font-normal tracking-[-0.02em]">
            Your spaces.
          </h1>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-smoke">
            Pick up where you left off, or jump into a space.
          </p>
        </div>

        <form id="new-space" action={createSpace} className="scroll-mt-24">
          <button type="submit" className="btn shrink-0 justify-center">
            New Space
          </button>
        </form>
      </header>

      <section className="mt-8">
        {spaces.length === 0 ? (
          <p className="mt-5 rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-smoke">
            No spaces yet. Create one above to start adding pages and components.
          </p>
        ) : (
          <SpaceRail spaces={spaces} />
        )}
      </section>

      <section className="mt-12 border-t border-line pt-8">
        <h2 className="font-primary text-2xl font-normal tracking-[-0.01em]">Recent Activity</h2>

        {activity.length === 0 ? (
          <p className="mt-5 rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-smoke">
            Nothing yet. Add a page or component inside a space and it shows up here.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {activity.map((item) => (
              <li key={`${item.kind}-${item.id}`}>
                <Link
                  href={
                    item.kind === "page"
                      ? `/dashboard/${item.space_slug}`
                      : `/dashboard/${item.space_slug}?view=design#components`
                  }
                  className="flex items-center gap-4 py-3.5"
                >
                  <span
                    aria-hidden
                    className={`font-primary flex size-10 shrink-0 items-center justify-center rounded-lg text-sm font-semibold ${
                      TILES[item.kind === "page" ? 0 : 2]
                    }`}
                  >
                    {initial(item.title)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{item.title}</span>
                    <span className="block truncate text-xs text-smoke">
                      {item.space_name} · {KIND_LABEL[item.kind]}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-smoke">{ago(item.created_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
