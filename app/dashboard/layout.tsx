import Link from "next/link";
import { listSpaces } from "@/db";

// The dashboard is per-request data, never prerendered.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const spaces = await listSpaces();

  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-paper text-ink lg:flex-row">
      <aside className="shrink-0 border-b border-line px-4 py-4 lg:w-64 lg:border-b-0 lg:border-r lg:py-6">
        <Link href="/" className="font-primary block px-2 text-lg font-semibold tracking-tight">
          CMSy
        </Link>
        <nav className="mt-4 flex flex-wrap gap-1 lg:mt-6 lg:flex-col">
          <Link href="/dashboard" className="tab">
            Home
          </Link>
          <Link href="/dashboard/connect" className="tab">
            Connect agent
          </Link>
          {/* Search and Settings are absent on purpose — no routes behind them yet. */}
          {spaces.length > 0 && (
            <p className="label mt-2 w-full px-2 lg:mt-4 lg:mb-1">Spaces</p>
          )}
          {spaces.map((space) => (
            <Link
              key={space.id}
              href={`/dashboard/${space.slug}`}
              className="tab flex items-center gap-2"
            >
              <span
                aria-hidden
                className="font-primary flex size-6 shrink-0 items-center justify-center rounded-md border border-line bg-card text-xs font-semibold"
              >
                {space.name.trim().charAt(0).toUpperCase() || "?"}
              </span>
              <span className="truncate">{space.name}</span>
            </Link>
          ))}
          <Link href="/dashboard#new-space" className="tab mt-2 flex items-center gap-2">
            <span aria-hidden className="flex size-6 shrink-0 items-center justify-center text-sm">
              +
            </span>
            New Space
          </Link>
        </nav>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
