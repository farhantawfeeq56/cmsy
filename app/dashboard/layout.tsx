import Link from "next/link";
import { listMcpTokens, listSpaces, type McpToken } from "@/db";
import { ago } from "./ago";
import { AgentPlacePicker, AgentSlot, type Agent } from "./agent-status";

// The dashboard is per-request data, never prerendered.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const [spaces, tokens] = await Promise.all([listSpaces(), listMcpTokens()]);

  // A live token that has been used means an agent is talking to us. Issuing one
  // is not the same thing, and a revoked one never counts.
  const live = tokens.find(
    (token): token is McpToken & { last_used_at: string } =>
      !token.revoked_at && token.last_used_at !== null,
  );
  const agent: Agent = live ? { name: live.name, lastUsed: ago(live.last_used_at) } : null;

  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-paper text-ink lg:flex-row">
      <aside className="flex shrink-0 flex-col border-b border-line px-4 py-4 lg:w-64 lg:border-b-0 lg:border-r lg:py-6">
        <Link href="/" className="font-primary block px-2 text-lg font-semibold tracking-tight">
          CMSy
        </Link>
        <AgentSlot place="sidebar-top" agent={agent} />
        <nav className="mt-4 flex flex-wrap gap-1 lg:mt-6 lg:flex-col">
          <Link href="/dashboard" className="tab">
            Home
          </Link>
          {/* Connect agent lives in the dashboard header, next to New Space. */}
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
          <AgentSlot place="nav-end" agent={agent} />
        </nav>
        <AgentSlot place="sidebar-foot" agent={agent} />
      </aside>
      <div className="min-w-0 flex-1">
        <AgentSlot place="content-top" agent={agent} />
        {children}
      </div>
      <AgentSlot place="floating" agent={agent} />
      <AgentPlacePicker />
    </div>
  );
}
