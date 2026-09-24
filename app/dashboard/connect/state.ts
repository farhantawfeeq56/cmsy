/**
 * Shape of the issue-token form result. Separate from `actions.ts` because a
 * `"use server"` module may only export async functions — the idle value is a
 * plain object, so it cannot live there.
 */
export type IssueState = {
  /** Plaintext, returned exactly once — it is not stored and cannot be shown again. */
  token: string | null;
  name: string | null;
  error: string | null;
};

export const IDLE_ISSUE_STATE: IssueState = { token: null, name: null, error: null };
