"use client";

import { useActionState, useEffect, useState } from "react";
import { issueToken } from "./actions";
import { IDLE_ISSUE_STATE } from "./state";

/**
 * Stands in for a token the user has not minted yet. Deliberately shouty: it is
 * the one thing on this page that is not ready to paste, and the notice above
 * the snippets says so.
 */
const PLACEHOLDER = "PASTE_YOUR_TOKEN_HERE";

type CopyPhase = "idle" | "copied" | "failed";

function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [phase, setPhase] = useState<CopyPhase>("idle");

  useEffect(() => {
    if (phase === "idle") return;
    const timer = setTimeout(() => setPhase("idle"), 2000);
    return () => clearTimeout(timer);
  }, [phase]);

  return (
    <button
      type="button"
      // Clipboard access needs a secure context, so it fails on a plain-HTTP
      // deploy. Say so instead of looking like nothing happened.
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setPhase("copied");
        } catch {
          setPhase("failed");
        }
      }}
      className="btn btn-quiet shrink-0"
    >
      {phase === "copied" ? "Copied" : phase === "failed" ? "Select it manually" : label}
    </button>
  );
}

/**
 * `min-w-0` is load-bearing: a grid item defaults to `min-width: auto` and would
 * stretch to the widest line of code, pushing the whole page sideways on a
 * phone. Letting it shrink is what puts the scrollbar on the `pre` instead.
 */
function Snippet({ title, hint, code }: { title: string; hint: string; code: string }) {
  return (
    <section className="min-w-0 rounded-xl border border-line bg-card">
      <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-sm font-medium">{title}</h3>
          <p className="mt-0.5 text-xs text-smoke">{hint}</p>
        </div>
        <CopyButton value={code} />
      </header>
      <pre className="overflow-x-auto px-4 py-3 text-xs leading-relaxed whitespace-pre">
        <code>{code}</code>
      </pre>
    </section>
  );
}

function buildSnippets(endpoint: string, auth: string | null) {
  const header = auth ? `Authorization: Bearer ${auth}` : null;

  const config = {
    mcpServers: {
      cmsy: {
        type: "http",
        url: endpoint,
        ...(auth ? { headers: { Authorization: `Bearer ${auth}` } } : {}),
      },
    },
  };

  return [
    {
      title: "Claude Code",
      hint: "Run this in the project you want connected.",
      code: header
        ? `claude mcp add --transport http cmsy ${endpoint} \\\n  --header "${header}"`
        : `claude mcp add --transport http cmsy ${endpoint}`,
    },
    {
      title: "Cursor / VS Code",
      hint: "Add to .cursor/mcp.json, or .vscode/mcp.json.",
      code: JSON.stringify(config, null, 2),
    },
    {
      title: "Any HTTP client",
      hint: "One round trip that proves the endpoint answers.",
      code: [
        `curl -sS -X POST ${endpoint} \\`,
        `  -H 'Content-Type: application/json' \\`,
        `  -H 'Accept: application/json, text/event-stream' \\`,
        ...(header ? [`  -H 'Authorization: Bearer ${auth}' \\`] : []),
        `  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'`,
      ].join("\n"),
    },
  ];
}

export function ConnectPanel({
  endpoint,
  needsToken,
}: {
  endpoint: string;
  needsToken: boolean;
}) {
  const [state, action, pending] = useActionState(issueToken, IDLE_ISSUE_STATE);

  // Only ever the token minted in this browser tab: the server stores a hash,
  // so a reload can never bring it back.
  const auth = needsToken ? state.token : null;
  const unfilled = needsToken && !auth;
  const snippets = buildSnippets(endpoint, needsToken ? (auth ?? PLACEHOLDER) : null);

  return (
    <>
      <section className="mt-10">
        <h2 className="font-primary text-2xl font-normal tracking-[-0.01em]">
          {needsToken ? "1. Issue a token" : "Tokens"}
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-smoke">
          {needsToken
            ? "This host is not loopback, so an agent has to present a bearer token. Name one and it appears below, once."
            : "You are on loopback, so nothing here needs a token. Issue one anyway if you want a credential ready for the deployed URL."}
        </p>

        {/* No flex-wrap: `.input` sets width:100%, which beats `sm:w-72`, so the
            field only sizes correctly when flex is allowed to shrink it. Same
            shape as the New Space form on the dashboard. */}
        <form action={action} className="mt-4 flex w-full gap-2 sm:w-auto">
          <input
            name="name"
            required
            maxLength={60}
            placeholder="e.g. Laptop — Claude Code"
            aria-label="Token name"
            className="input sm:w-72"
          />
          <button type="submit" disabled={pending} className="btn shrink-0 justify-center">
            {pending ? "Issuing…" : "Issue token"}
          </button>
        </form>

        {state.error && (
          <p role="alert" className="mt-3 text-sm text-ember">
            {state.error}
          </p>
        )}

        {state.token && (
          <div className="mt-4 rounded-xl border border-line bg-butter p-4">
            <p className="text-sm font-medium">
              Copy “{state.name}” now — this is the only time it is shown.
            </p>
            <p className="mt-1 text-xs text-smoke">
              Only a hash is stored. Lose it and you revoke it and issue another.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <code className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-line bg-card px-3 py-2 text-xs whitespace-nowrap">
                {state.token}
              </code>
              <CopyButton value={state.token} label="Copy token" />
            </div>
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="font-primary text-2xl font-normal tracking-[-0.01em]">
          {needsToken ? "2. Paste into your client" : "Paste into your client"}
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-smoke">
          Every snippet points at <code className="text-ink">{endpoint}</code>, the URL this page
          was served from.
        </p>

        {unfilled && (
          <p className="mt-3 rounded-lg border border-line bg-lilac px-3 py-2 text-xs">
            These still say <code>{PLACEHOLDER}</code>. Issue a token above and they fill in with
            it.
          </p>
        )}

        <div className="mt-4 grid gap-4">
          {snippets.map((snippet) => (
            <Snippet key={snippet.title} {...snippet} />
          ))}
        </div>
      </section>
    </>
  );
}
