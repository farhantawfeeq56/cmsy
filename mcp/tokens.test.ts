import { describe, expect, it } from "vitest";
import { TOKEN_PREFIX, displayPrefix, hashToken, isIssuedToken, mintToken } from "./tokens";

describe("hashToken", () => {
  it("is plain SHA-256 as lowercase hex", async () => {
    // The FIPS 180-2 test vector, so a change of algorithm or encoding fails here.
    expect(await hashToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("is deterministic, which the database lookup depends on", async () => {
    expect(await hashToken("cmsy_same")).toBe(await hashToken("cmsy_same"));
  });
});

describe("mintToken", () => {
  it("returns a prefixed token of 256 random bits, base64url without padding", async () => {
    const { token } = await mintToken();
    expect(token.startsWith(TOKEN_PREFIX)).toBe(true);
    // 32 bytes encode to 43 base64url characters once the "=" is stripped.
    expect(token.slice(TOKEN_PREFIX.length)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("stores only a hash and a short stub, never the token itself", async () => {
    const { token, hash, prefix } = await mintToken();
    expect(hash).toBe(await hashToken(token));
    expect(hash).not.toContain(token.slice(TOKEN_PREFIX.length));
    expect(prefix).toBe(token.slice(0, TOKEN_PREFIX.length + 6));
    expect(prefix).toBe(displayPrefix(token));
  });

  it("does not repeat", async () => {
    const tokens = await Promise.all(Array.from({ length: 50 }, () => mintToken()));
    expect(new Set(tokens.map((t) => t.token)).size).toBe(50);
  });
});

describe("isIssuedToken", () => {
  it("recognises only the cmsy_ prefix", () => {
    expect(isIssuedToken("cmsy_abc")).toBe(true);
    expect(isIssuedToken("abc")).toBe(false);
    expect(isIssuedToken("CMSY_abc")).toBe(false);
  });
});
