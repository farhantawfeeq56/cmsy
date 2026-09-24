import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashToken } from "@/mcp/tokens";

// Only the token lookup is replaced; the SDK's bearer gate, Origin check and
// MCP handler are the real ones, so these tests exercise the route as deployed.
vi.mock("@/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db")>()),
  authenticateMcpToken: vi.fn(),
}));

const { authenticateMcpToken } = await import("@/db");
const { POST } = await import("./route");

const PUBLIC = "cmsy.example.dev";
const SHARED = "a-long-shared-secret-for-tests";

function initialize(host: string | null, headers: Record<string, string> = {}) {
  const init: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    ...headers,
  };
  if (host) init.host = host;
  return new Request(`http://${host ?? "unknown"}/api/mcp`, {
    method: "POST",
    headers: init,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "route-test", version: "0" },
      },
    }),
  });
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

beforeEach(() => {
  vi.mocked(authenticateMcpToken).mockReset();
  vi.stubEnv("MCP_AUTH_TOKEN", SHARED);
});

describe("POST /api/mcp: request checks before auth", () => {
  it("rejects a request with no Host header", async () => {
    const response = await POST(initialize(null));
    expect(response.status).toBe(403);
  });

  it("rejects a browser Origin that does not match the host", async () => {
    const response = await POST(initialize("localhost:3000", { origin: "https://evil.example" }));
    expect(response.status).toBe(403);
  });

  it("lets loopback through without a token", async () => {
    const response = await POST(initialize("localhost:3000"));
    expect(response.status).toBe(200);
    expect(authenticateMcpToken).not.toHaveBeenCalled();
  });
});

describe("POST /api/mcp: bearer auth off loopback", () => {
  it("answers a missing token with the 401 challenge", async () => {
    const response = await POST(initialize(PUBLIC));
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toMatch(/^Bearer/);
  });

  it("accepts the shared secret without a database round trip", async () => {
    const response = await POST(initialize(PUBLIC, bearer(SHARED)));
    expect(response.status).toBe(200);
    expect(authenticateMcpToken).not.toHaveBeenCalled();
  });

  it("rejects a wrong secret without a database round trip", async () => {
    const response = await POST(initialize(PUBLIC, bearer("not-the-secret")));
    expect(response.status).toBe(401);
    expect(authenticateMcpToken).not.toHaveBeenCalled();
  });

  it("rejects everything but issued tokens when no shared secret is set", async () => {
    vi.stubEnv("MCP_AUTH_TOKEN", "");
    const response = await POST(initialize(PUBLIC, bearer("anything")));
    expect(response.status).toBe(401);
    expect(authenticateMcpToken).not.toHaveBeenCalled();
  });

  it("accepts a live issued token, looking it up by hash only", async () => {
    vi.mocked(authenticateMcpToken).mockResolvedValue({ id: "t1", owner: "o", name: "n" });
    const token = "cmsy_live-token";
    const response = await POST(initialize(PUBLIC, bearer(token)));
    expect(response.status).toBe(200);
    expect(authenticateMcpToken).toHaveBeenCalledExactlyOnceWith(await hashToken(token));
  });

  it("rejects an unknown or revoked issued token", async () => {
    // The inferred return type drops null because `const [row] = rows` is
    // unchecked indexed access, but at runtime a miss resolves to null.
    vi.mocked(authenticateMcpToken).mockResolvedValue(null as never);
    const response = await POST(initialize(PUBLIC, bearer("cmsy_revoked")));
    expect(response.status).toBe(401);
  });
});
