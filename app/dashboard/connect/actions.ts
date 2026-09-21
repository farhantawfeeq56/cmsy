"use server";

import { revalidatePath } from "next/cache";
import { insertMcpToken, revokeMcpToken } from "@/db";
import { mintToken } from "@/mcp/tokens";
import { IDLE_ISSUE_STATE, type IssueState } from "./state";

/**
 * Nothing signs anyone in yet (#21), so every token belongs to the one operator
 * who can reach the dashboard. The column exists so that when #24 verifies Neon
 * Auth JWTs it can start writing the real subject here without a migration —
 * the page says as much out loud rather than implying accounts that do not
 * exist.
 */
const OWNER = "local";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_NAME = 60;

const refresh = () => revalidatePath("/dashboard/connect");

/**
 * Returns the plaintext through the action result rather than a redirect or a
 * cookie, so the one copy of the secret never lands in a URL, the browser
 * history or a server log.
 */
export async function issueToken(_previous: IssueState, formData: FormData): Promise<IssueState> {
  const raw = formData.get("name");
  const name = (typeof raw === "string" ? raw : "").trim().slice(0, MAX_NAME);
  if (!name) {
    return { ...IDLE_ISSUE_STATE, error: "Name the token — it is how you tell it apart later." };
  }

  const { token, hash, prefix } = await mintToken();
  const row = await insertMcpToken({ owner: OWNER, name, prefix, hash });
  if (!row) return { ...IDLE_ISSUE_STATE, error: "Could not issue that token. Try again." };

  refresh();
  return { token, name, error: null };
}

/** Revoking is immediate: `/api/mcp` reads `revoked_at` on every request. */
export async function revokeToken(formData: FormData) {
  const raw = formData.get("id");
  const id = typeof raw === "string" && UUID.test(raw.trim()) ? raw.trim() : null;
  if (!id) return;

  await revokeMcpToken(id);
  refresh();
}
