import { headers } from "next/headers";
import { listMcpTokens } from "@/db";
import { hostnameOf, isLoopbackHost, mcpEndpoint } from "@/mcp/endpoint";
import { ago } from "../ago";
import { revokeToken } from "./actions";
import { ConnectPanel } from "./panel";

// Endpoint and token list are both per-request; never prerender this.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Connect your agent · CMSy",
};

export default async function ConnectPage() {
  const incoming = await headers();
  const host = incoming.get("host");
  const endpoint = mcpEndpoint(host, incoming.get("x-forwarded-proto"));
  const needsToken = !isLoopbackHost(hostnameOf(host));

  const tokens = await listMcpTokens();

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <header>
        <h1 className="font-primary text-4xl font-normal tracking-[-0.02em]">
          Connect your agent.
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-smoke">
          CMSy speaks MCP over Streamable HTTP. Point a coding agent at the endpoint below and it
          can read your spaces.
        </p>
      </header>

      <section className="mt-8 rounded-xl border border-line bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="label">MCP endpoint</p>
          <span className={`badge ${needsToken ? "" : "badge-quiet"}`}>
            {needsToken ? "Bearer token required" : "Loopback — no token needed"}
          </span>
        </div>
        <p className="mt-2 font-mono text-sm break-all">
          {endpoint ?? "Unavailable — this request arrived with no Host header."}
        </p>
        <p className="mt-3 text-xs leading-relaxed text-smoke">
          {needsToken
            ? "Anything that is not localhost must authenticate, so a page scraped off the internet cannot drive your endpoint."
            : "Loopback requests skip auth so local dev is one step. The same app deployed will ask for a token."}
        </p>
      </section>

      {endpoint ? (
        <ConnectPanel endpoint={endpoint} needsToken={needsToken} />
      ) : (
        <p className="mt-10 rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-smoke">
          Cannot build the snippets without a Host header.
        </p>
      )}

      <TokenList tokens={tokens} />

      <section className="mt-12 border-t border-line pt-8">
        <h2 className="font-primary text-2xl font-normal tracking-[-0.01em]">How auth works</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-line bg-card p-5">
            <dt className="text-sm font-medium">Loopback — no token</dt>
            <dd className="mt-2 text-sm leading-relaxed text-smoke">
              Requests whose Host is <code className="text-ink">localhost</code>,{" "}
              <code className="text-ink">127.0.0.1</code> or <code className="text-ink">::1</code>{" "}
              skip auth entirely. That is what lets the checked-in{" "}
              <code className="text-ink">.mcp.json</code> work with no secret committed.
            </dd>
          </div>
          <div className="rounded-xl border border-line bg-card p-5">
            <dt className="text-sm font-medium">Deployed — bearer token</dt>
            <dd className="mt-2 text-sm leading-relaxed text-smoke">
              Every other host needs{" "}
              <code className="text-ink">Authorization: Bearer &lt;token&gt;</code>. Without it the
              endpoint answers <code className="text-ink">401</code> with a{" "}
              <code className="text-ink">WWW-Authenticate</code> challenge; a forged{" "}
              <code className="text-ink">Origin</code> gets <code className="text-ink">403</code>.
            </dd>
          </div>
        </dl>
        <p className="mt-4 max-w-2xl text-xs leading-relaxed text-smoke">
          CMSy has no sign-in yet, so every token on this page belongs to whoever can open this
          dashboard rather than to an account. Tokens are stored as a SHA-256 hash, shown once, and
          checked against the database on every request — revoking one takes effect immediately.
          The older <code className="text-ink">MCP_AUTH_TOKEN</code> shared secret still works, and
          has no owner and no audit trail; prefer a token issued here.
        </p>
      </section>
    </main>
  );
}

function TokenList({ tokens }: { tokens: Awaited<ReturnType<typeof listMcpTokens>> }) {
  return (
    <section className="mt-12">
      <h2 className="font-primary text-2xl font-normal tracking-[-0.01em]">Your tokens</h2>

      {tokens.length === 0 ? (
        <p className="mt-5 rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-smoke">
          No tokens yet. Issue one above to connect a deployed instance.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {tokens.map((token) => {
            const revokedAt = token.revoked_at;
            const revoked = revokedAt !== null;
            return (
              <li
                key={token.id}
                className={`flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5 ${
                  revoked ? "opacity-55" : ""
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{token.name}</span>
                    {revoked && <span className="badge badge-quiet">Revoked</span>}
                  </span>
                  <span className="mt-0.5 block truncate font-mono text-xs text-smoke">
                    {token.token_prefix}… · created {ago(token.created_at)}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-smoke">
                  {revokedAt
                    ? `Revoked ${ago(revokedAt)}`
                    : token.last_used_at
                      ? `Last used ${ago(token.last_used_at)}`
                      : "Never used"}
                </span>
                {!revoked && (
                  <form action={revokeToken} className="shrink-0">
                    <input type="hidden" name="id" value={token.id} />
                    <button type="submit" className="btn btn-quiet">
                      Revoke
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
