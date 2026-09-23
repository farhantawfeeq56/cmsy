import { timingSafeEqual } from "node:crypto";
import {
  type AuthInfo,
  createMcpHandler,
  OAuthError,
  OAuthErrorCode,
  requireBearerAuth,
  validateOriginHeader,
} from "@modelcontextprotocol/server";
import { createCmsyMcpServer } from "@/mcp/server";

// The handler talks to Postgres per request and must never be prerendered.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = createMcpHandler(createCmsyMcpServer, {
  onerror: (error) => console.error("[mcp]", error),
});

// Requests aimed at these hosts are local dev: no bearer token needed, so the
// checked-in `.mcp.json` connects in one step without committing a secret.
const LOOPBACK = ["localhost", "127.0.0.1", "[::1]", "::1"];

// Shared-secret bearer token, not Neon Auth JWTs — there is no login flow
// issuing user tokens yet, and a high-entropy secret over HTTPS is enough to
// gate a read-only tool. Per-user JWT verification is the follow-up (#24).
const verifier = {
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const expected = process.env.MCP_AUTH_TOKEN;
    if (!expected) {
      console.error("[mcp] refusing non-loopback request: MCP_AUTH_TOKEN is not set");
      throw new OAuthError(OAuthErrorCode.ServerError, "MCP auth is not configured on this server");
    }
    const presented = Buffer.from(token);
    const configured = Buffer.from(expected);
    if (presented.length !== configured.length || !timingSafeEqual(presented, configured)) {
      throw new OAuthError(OAuthErrorCode.InvalidToken, "Invalid token");
    }
    return {
      token,
      clientId: "cmsy-agent",
      scopes: [],
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    };
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
  let hostname = "";
  try {
    hostname = new URL(`http://${request.headers.get("host")}`).hostname;
  } catch {
    return forbidden("Invalid Host header");
  }
  if (!hostname) return forbidden("Missing Host header");

  const loopback = LOOPBACK.includes(hostname);

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
