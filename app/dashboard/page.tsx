import Link from "next/link";
import { listRecentActivity, listSpaces, type ActivityItem } from "@/db";
import { createSpace } from "./actions";

const TILES = ["bg-mint", "bg-butter", "bg-lilac"];

const KIND_LABEL: Record<ActivityItem["kind"], string> = {
  page: "Page created",
  component: "Component created",
};

const initial = (value: string) => value.trim().charAt(0).toUpperCase() || "?";

/** Intl.RelativeTimeFormat is the whole library, no date dep needed. */
function ago(value: string) {
  const seconds = (Date.now() - new Date(value).getTime()) / 1000;
  const units = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ] as const;
  const format = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, size] of units) {
    if (seconds >= size) return format.format(-Math.floor(seconds / size), unit);
  }
  return "just now";
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  return hour < 18 ? "Good afternoon" : "Good evening";
}

export default async function DashboardPage() {
  const [spaces, activity] = await Promise.all([listSpaces(), listRecentActivity()]);

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-sm text-smoke">{greeting()},</p>
          <h1 className="font-primary mt-1 text-4xl font-normal tracking-[-0.02em]">
            Your spaces.
          </h1>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-smoke">
            Pick up where you left off, or jump into a space.
          </p>
        </div>

        <form
          id="new-space"
          action={createSpace}
          className="flex w-full scroll-mt-24 gap-2 sm:w-auto"
        >
          <input
            name="name"
            required
            maxLength={80}
            placeholder="New space name"
            aria-label="New space name"
            className="input sm:w-56"
          />
          <button type="submit" className="btn shrink-0 justify-center">
            New Space
          </button>
        </form>
      </header>

      <section className="mt-12">
        <h2 className="font-primary text-2xl font-normal tracking-[-0.01em]">Your Spaces</h2>

        {spaces.length === 0 ? (
          <p className="mt-5 rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-smoke">
            No spaces yet. Create one above to start adding pages and components.
          </p>
        ) : (
          <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {spaces.map((space, index) => (
              <li key={space.id}>
                <Link
                  href={`/dashboard/${space.slug}`}
                  className="group flex h-full flex-col overflow-hidden rounded-xl border border-line bg-card transition-colors hover:border-ink/20"
                >
                  {/* Pastel cover stands in for artwork — no image storage yet. */}
                  <div className={`h-24 ${TILES[index % TILES.length]}`} />
                  <div className="-mt-6 px-5">
                    <span className="font-primary flex size-12 items-center justify-center rounded-lg border border-line bg-card text-base font-semibold">
                      {initial(space.name)}
                    </span>
                  </div>
                  <div className="flex flex-1 items-end justify-between gap-3 p-5 pt-3">
                    <div className="min-w-0">
                      <h3 className="font-primary truncate text-lg font-medium tracking-tight">
                        {space.name}
                      </h3>
                      <p className="mt-1 text-sm text-smoke">
                        {space.page_count} {space.page_count === 1 ? "page" : "pages"} ·{" "}
                        {space.component_count}{" "}
                        {space.component_count === 1 ? "component" : "components"}
                      </p>
                      <p className="mt-2 text-xs text-smoke">Updated {ago(space.updated_at)}</p>
                    </div>
                    <span
                      aria-hidden
                      className="flex size-8 shrink-0 items-center justify-center rounded-full border border-line text-sm text-smoke transition-colors group-hover:border-ink/20 group-hover:text-ink"
                    >
                      →
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
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
                  href={`/dashboard/${item.space_slug}?tab=${
                    item.kind === "page" ? "pages" : "components"
                  }`}
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
