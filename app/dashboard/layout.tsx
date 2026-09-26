import Link from "next/link";
import { listMcpTokens, type McpToken } from "@/db";
import { ago } from "./ago";
import { GlobalSearch } from "./global-search";

// The dashboard is per-request data, never prerendered.
export const dynamic = "force-dynamic";

/**
 * Whether an agent is talking to CMSy, and the way to the page that changes it.
 * Both states link there, because this is the only way in.
 */
function AgentStatus({ agent }: { agent: { name: string; lastUsed: string } | null }) {
  return agent ? (
    <Link
      href="/dashboard/connect"
      title={`${agent.name} · last used ${agent.lastUsed}`}
      className="badge shrink-0"
    >
      <span aria-hidden className="size-1.5 rounded-full bg-ink" />
      Agent connected
    </Link>
  ) : (
    <Link href="/dashboard/connect" className="btn btn-quiet shrink-0 border border-line">
      Connect agent
    </Link>
  );
}

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const tokens = await listMcpTokens();

  // A live token that has been used means an agent is talking to us. Issuing one
  // is not the same thing, and a revoked one never counts.
  const live = tokens.find(
    (token): token is McpToken & { last_used_at: string } =>
      !token.revoked_at && token.last_used_at !== null,
  );
  const agent = live ? { name: live.name, lastUsed: ago(live.last_used_at) } : null;

  return (
    <div className="flex min-h-dvh flex-col bg-paper text-ink">
      {/* One header for every dashboard page: the logo is the way home, the
          search is a keystroke away, and the agent state never moves. */}
      <header className="border-b border-line">
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center gap-3 px-6 py-3.5">
          <Link
            href="/dashboard"
            className="font-primary shrink-0 text-lg font-semibold tracking-tight"
          >
            CMSy
          </Link>

          <GlobalSearch />

          <div className="ml-auto">
            <AgentStatus agent={agent} />
          </div>
        </div>
      </header>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
