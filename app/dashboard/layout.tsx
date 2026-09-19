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
        <nav className="mt-4 flex flex-wrap gap-1 lg:mt-8 lg:flex-col">
          <Link href="/dashboard" className="tab">
            All spaces
          </Link>
          {spaces.map((space) => (
            <Link key={space.id} href={`/dashboard/${space.slug}`} className="tab">
              {space.name}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
