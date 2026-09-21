/**
 * Minting and hashing for the agent tokens that authenticate `/api/mcp`.
 *
 * Deliberately free of Node and Next imports, like the rest of `mcp/`: this
 * runs in the Next dev server, in the Workers runtime and in a plain Node
 * process, so it uses Web Crypto rather than `node:crypto` and needs no
 * compatibility flag to do it.
 */

/** Marks a string as a CMSy agent token, in a log, a paste or an env file. */
export const TOKEN_PREFIX = "cmsy_";

/** 32 bytes = 256 bits, the same order of entropy as `openssl rand -hex 32`. */
const TOKEN_BYTES = 32;

/** How much of the token the dashboard shows to tell two of them apart. */
const DISPLAY_CHARS = 6;

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * A single unsalted SHA-256, which would be wrong for a password and is right
 * here: the input is already 256 bits of uniform randomness, so there is no
 * dictionary to defend against, and the digest has to be deterministic for the
 * database to find a presented token by it.
 */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** The prefix stored alongside the hash, so the list can show a stable stub. */
export const displayPrefix = (token: string) =>
  token.slice(0, TOKEN_PREFIX.length + DISPLAY_CHARS);

/** True for tokens this instance issued, which routes the verifier's lookup. */
export const isIssuedToken = (token: string) => token.startsWith(TOKEN_PREFIX);

/**
 * The plaintext is returned once and never stored — the caller shows it to the
 * user and keeps only `hash` and `prefix`.
 */
export async function mintToken() {
  const token = TOKEN_PREFIX + base64url(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)));
  return { token, hash: await hashToken(token), prefix: displayPrefix(token) };
}
