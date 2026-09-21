/**
 * Where the MCP endpoint lives and whether reaching it needs a token.
 *
 * Shared by the route that enforces the rule and the dashboard page that
 * explains it, so the two can never drift apart. Framework-free, like the rest
 * of `mcp/`.
 */

/** The one path Streamable HTTP serves every message on. */
export const MCP_PATH = "/api/mcp";

/** Hosts treated as local dev, where no bearer token is required. */
export const LOOPBACK = ["localhost", "127.0.0.1", "[::1]", "::1"];

export const isLoopbackHost = (hostname: string) => LOOPBACK.includes(hostname);

/** The hostname out of a `Host` header, dropping any port. "" if unparseable. */
export function hostnameOf(host: string | null | undefined): string {
  if (!host) return "";
  try {
    return new URL(`http://${host}`).hostname;
  } catch {
    return "";
  }
}

/**
 * The endpoint to hand an agent, derived from the request rather than from
 * config: one deploy answers on `localhost:3000`, on `localhost:3001` under the
 * Workers runtime and on its public hostname, and each has to print itself
 * rather than a hardcoded guess.
 *
 * Scheme comes from `X-Forwarded-Proto` where a proxy sets it (Cloudflare
 * does), and otherwise from whether the host is loopback — nothing else serves
 * plain HTTP.
 */
export function mcpEndpoint(host: string | null | undefined, forwardedProto?: string | null) {
  if (!host) return null;
  // A comma-joined list means several proxies appended to it; the first is the
  // scheme the client actually spoke.
  const proto = forwardedProto?.split(",")[0]?.trim();
  const scheme = proto || (isLoopbackHost(hostnameOf(host)) ? "http" : "https");
  return `${scheme}://${host}${MCP_PATH}`;
}
