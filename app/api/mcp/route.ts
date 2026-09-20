import { createMcpHandler } from "@modelcontextprotocol/server";
import { createCmsyMcpServer } from "@/mcp/server";

// The handler talks to Postgres per request and must never be prerendered.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = createMcpHandler(createCmsyMcpServer, {
  onerror: (error) => console.error("[mcp]", error),
});

/**
 * Streamable HTTP puts every MCP message on this one endpoint: POST carries
 * JSON-RPC, GET opens the server-to-client SSE stream, DELETE ends a session.
 */
export async function POST(request: Request) {
  return handler.fetch(request);
}

export async function GET(request: Request) {
  return handler.fetch(request);
}

export async function DELETE(request: Request) {
  return handler.fetch(request);
}
