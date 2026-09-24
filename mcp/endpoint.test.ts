import { describe, expect, it } from "vitest";
import { hostnameOf, isLoopbackHost, mcpEndpoint } from "./endpoint";

describe("hostnameOf", () => {
  it("drops the port", () => {
    expect(hostnameOf("localhost:3000")).toBe("localhost");
    expect(hostnameOf("cmsy.example.dev")).toBe("cmsy.example.dev");
  });

  it("keeps IPv6 bracketed, matching the LOOPBACK list", () => {
    expect(hostnameOf("[::1]:3001")).toBe("[::1]");
    expect(isLoopbackHost(hostnameOf("[::1]:3001"))).toBe(true);
  });

  it("returns empty for a missing or unparseable Host", () => {
    expect(hostnameOf(null)).toBe("");
    expect(hostnameOf(undefined)).toBe("");
    expect(hostnameOf("")).toBe("");
    expect(hostnameOf("bad host")).toBe("");
  });
});

describe("isLoopbackHost", () => {
  it("does not treat a lookalike public name as loopback", () => {
    expect(isLoopbackHost("localhost.example.com")).toBe(false);
    expect(isLoopbackHost("127.0.0.2")).toBe(false);
  });
});

describe("mcpEndpoint", () => {
  it("uses http for loopback and https for anything else", () => {
    expect(mcpEndpoint("localhost:3000")).toBe("http://localhost:3000/api/mcp");
    expect(mcpEndpoint("cmsy.example.dev")).toBe("https://cmsy.example.dev/api/mcp");
  });

  it("prefers the first scheme a proxy forwarded", () => {
    expect(mcpEndpoint("cmsy.example.dev", "http, https")).toBe("http://cmsy.example.dev/api/mcp");
    expect(mcpEndpoint("localhost:3000", "https")).toBe("https://localhost:3000/api/mcp");
  });

  it("returns null without a Host", () => {
    expect(mcpEndpoint(null)).toBeNull();
  });
});
