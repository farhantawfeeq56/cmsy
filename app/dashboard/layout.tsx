import Link from "next/link";
import { Suspense } from "react";
import { findConnectedAgent } from "@/db";
import { ago } from "./ago";
import { GlobalSearch } from "./global-search";

// The dashboard is per-request data, never prerendered.
export const dynamic = "force-dynamic";

/**
 * Whether an agent is talking to CMSy, and the way to the page that changes it.
 * Both states link there, because this is the only way in.
 *
 * Its own async component inside a Suspense boundary, so the header and the
 * page below it do not wait on this query.
 */
async function AgentStatus() {
  const live = await findConnectedAgent();

  return live ? (
    <Link
      href="/dashboard/connect"
      title={`${live.name} · last used ${ago(live.last_used_at)}`}
      className="badge badge-quiet shrink-0"
    >
      <span aria-hidden className="size-1.5 rounded-full bg-mint" />
      Agent connected
    </Link>
  ) : (
    <Link href="/dashboard/connect" className="btn btn-quiet shrink-0 border border-line">
      Connect agent
    </Link>
  );
}

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <div className="flex min-h-dvh flex-col bg-paper text-ink">
      {/* One header for every dashboard page: the logo is the way home, the
          search is a keystroke away, and the agent state never moves. */}
      <header className="border-b border-line">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-3 px-6 py-3.5 sm:px-8 lg:px-10">
          <Link
            href="/dashboard"
            className="font-display shrink-0 text-lg font-semibold tracking-tight"
          >
            CMSy
          </Link>

          <GlobalSearch />

          <div className="ml-auto">
            {/* Nothing until the query answers: either state as a placeholder
                would claim something about the agent that may be untrue. */}
            <Suspense fallback={null}>
              <AgentStatus />
            </Suspense>
          </div>
        </div>
      </header>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
