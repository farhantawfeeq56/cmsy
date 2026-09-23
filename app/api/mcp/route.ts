import { timingSafeEqual } from "node:crypto";
import {
  type AuthInfo,
  createMcpHandler,
  OAuthError,
  OAuthErrorCode,
  requireBearerAuth,
  validateOriginHeader,
} from "@modelcontextprotocol/server";
import { authenticateMcpToken } from "@/db";
import { LOOPBACK, hostnameOf, isLoopbackHost } from "@/mcp/endpoint";
import { hashToken, isIssuedToken } from "@/mcp/tokens";
import { createCmsyMcpServer } from "@/mcp/server";

// The handler talks to Postgres per request and must never be prerendered.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = createMcpHandler(createCmsyMcpServer, {
  onerror: (error) => console.error("[mcp]", error),
});

/**
 * The SDK rejects an `AuthInfo` with no `expiresAt` and offers no way to opt
 * out, so every credential here has to claim one. It is a formality rather than
 * a lifetime: the verifier runs on every request, so an issued token's real
 * validity is whatever `mcp_tokens.revoked_at` says at that moment, and a
 * revoked token stops working immediately regardless of this window.
 */
const ASSERTED_TTL_SECONDS = 3600;

const expiry = () => Math.floor(Date.now() / 1000) + ASSERTED_TTL_SECONDS;

/** Constant-time compare that tolerates a length mismatch. */
function sameSecret(presented: string, configured: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(configured);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Two credentials are accepted, in this order:
 *
 *  1. The `MCP_AUTH_TOKEN` shared secret, kept so deployments that predate
 *     issuance keep working. It has no owner and no audit trail — prefer an
 *     issued token, and see #24 for retiring it. It is checked first so that a
 *     secret which happens to start with the issued-token prefix still works,
 *     and so it never costs a database round trip.
 *  2. A token issued by /dashboard/connect. Only its SHA-256 is stored, so the
 *     lookup hashes what was presented; the same statement rejects revoked rows
 *     and stamps `last_used_at`, which is what makes the dashboard's "last
 *     used" column and its Revoke button mean anything.
 *
 * An unset `MCP_AUTH_TOKEN` is a normal configuration now that tokens can be
 * issued, so a failed match is an ordinary 401 and is not logged.
 *
 * Neon Auth JWTs are deliberately not handled here; that is #24.
 */
const verifier = {
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const shared = process.env.MCP_AUTH_TOKEN;
    if (shared && sameSecret(token, shared)) {
      return {
        token,
        clientId: "cmsy-agent",
        scopes: [],
        expiresAt: expiry(),
      };
    }

    if (isIssuedToken(token)) {
      const row = await authenticateMcpToken(await hashToken(token));
      // Unknown and revoked are one answer on purpose: a caller must not be
      // able to probe which of its tokens still exist.
      if (row) {
        return {
          token,
          clientId: `cmsy-token:${row.id}`,
          scopes: [],
          expiresAt: expiry(),
          extra: { owner: row.owner, tokenName: row.name },
        };
      }
    }

    throw new OAuthError(OAuthErrorCode.InvalidToken, "Invalid token");
  },
};

const gate = requireBearerAuth({ verifier });

function forbidden(message: string): Response {
  return Response.json(
    { jsonrpc: "2.0", error: { code: -32000, message }, id: null },
    { status: 403 },
  );
}

async function guarded(request: Request): Promise<Response> {
  // 1. Host must parse — the start of the DNS-rebinding defence.
  const hostname = hostnameOf(request.headers.get("host"));
  if (!hostname) return forbidden("Missing or invalid Host header");

  const loopback = isLoopbackHost(hostname);

  // 2. When a browser sends Origin it must match the destination (loopback
  // servers only accept loopback origins). Non-browser MCP clients send no
  // Origin and sail through. This stops rebinding/cross-origin pages from
  // driving the endpoint.
  const origin = validateOriginHeader(request.headers.get("origin"), loopback ? LOOPBACK : [hostname]);
  if (!origin.ok) return forbidden(origin.message);

  // 3. Local dev stays frictionless; everything else needs the bearer token.
  // Missing/invalid tokens get the SDK's 401 + WWW-Authenticate challenge.
  if (!loopback) {
    const auth = await gate(request);
    if (auth instanceof Response) return auth;
  }

  return handler.fetch(request);
}

/**
 * Streamable HTTP puts every MCP message on this one endpoint: POST carries
 * JSON-RPC, GET opens the server-to-client SSE stream, DELETE ends a session.
 */
export async function POST(request: Request) {
  return guarded(request);
}

export async function GET(request: Request) {
  return guarded(request);
}

export async function DELETE(request: Request) {
  return guarded(request);
}
