#!/usr/bin/env node
// Proves the snippets on /dashboard/connect actually connect: one `initialize`
// and one `tools/list` round trip against a running server, over the same
// Streamable HTTP transport a real agent uses.
//
//   node scripts/mcp-smoke.mjs                          # localhost:3000, no token
//   node scripts/mcp-smoke.mjs http://localhost:3001/api/mcp
//   node scripts/mcp-smoke.mjs https://<deploy>/api/mcp cmsy_<token>
//
// The token may also come from MCP_TOKEN. Exits non-zero on the first failure.

const endpoint = process.argv[2] ?? "http://localhost:3000/api/mcp";
const token = process.argv[3] ?? process.env.MCP_TOKEN ?? "";

const PROTOCOL_VERSION = "2025-06-18";

let sessionId = null;

function headers() {
  const value = {
    "Content-Type": "application/json",
    // Streamable HTTP lets the server reply with either, so accept both.
    Accept: "application/json, text/event-stream",
  };
  if (token) value.Authorization = `Bearer ${token}`;
  if (sessionId) value["Mcp-Session-Id"] = sessionId;
  return value;
}

/** SSE frames carry the JSON-RPC payload on `data:` lines; plain JSON is itself. */
function parseBody(contentType, body) {
  if (!contentType.includes("text/event-stream")) return JSON.parse(body);
  const data = body
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("");
  if (!data) throw new Error(`no data frame in SSE response:\n${body}`);
  return JSON.parse(data);
}

async function rpc(method, params, id) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });

  // The server assigns a session on initialize; echo it back on later calls.
  sessionId ??= response.headers.get("mcp-session-id");

  const body = await response.text();
  if (!response.ok) {
    const challenge = response.headers.get("www-authenticate");
    throw new Error(
      `${method} → HTTP ${response.status}${challenge ? ` (${challenge})` : ""}\n${body}`,
    );
  }

  const message = parseBody(response.headers.get("content-type") ?? "", body);
  if (message.error) {
    throw new Error(`${method} → JSON-RPC ${message.error.code}: ${message.error.message}`);
  }
  return message.result;
}

/** Fire-and-forget: the spec requires it after initialize and expects no reply. */
async function notify(method) {
  await fetch(endpoint, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ jsonrpc: "2.0", method }),
  });
}

function check(condition, message) {
  if (!condition) throw new Error(message);
}

console.log(`→ ${endpoint}${token ? " (with bearer token)" : " (no token)"}`);

const initialized = await rpc(
  "initialize",
  {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "cmsy-smoke", version: "1.0.0" },
  },
  1,
);

check(initialized?.serverInfo?.name === "cmsy", `unexpected serverInfo: ${JSON.stringify(initialized?.serverInfo)}`);
check(initialized?.capabilities?.tools, "server does not advertise the tools capability");
console.log(`✓ initialize — ${initialized.serverInfo.name} v${initialized.serverInfo.version}`);

await notify("notifications/initialized");

const { tools } = await rpc("tools/list", {}, 2);
check(Array.isArray(tools) && tools.length > 0, "tools/list returned no tools");
check(
  tools.some((tool) => tool.name === "list_spaces"),
  `tools/list is missing list_spaces (got ${tools.map((t) => t.name).join(", ")})`,
);
console.log(`✓ tools/list — ${tools.map((tool) => tool.name).join(", ")}`);

console.log("\nMCP endpoint is reachable and answering.");
