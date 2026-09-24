# CMSy

**CMSy** is a code-connected content and component management environment.

It sits between your existing codebase and a visual editing interface, allowing you to edit content and build UI components without manually jumping between code and a CMS.

## What is CMSy?

CMSy connects to an existing codebase through the **CMSy MCP**.

It has two primary environments:

- **Components Editor** — create and modify components using AI / vibe coding.
- **No-Code Editor** — visually edit structured content such as blog posts and other application content.

Changes made through CMSy are translated into a format that the connected agent can understand and apply to the codebase.

## Architecture

### Layers

| Layer | Description |
| --- | --- |
| **CMSy App** | The visual interface, containing the **Component Editor** and the **No-Code Editor** |
| **CMSy MCP** | The bridge that translates CMSy changes into instructions agents can act on |
| **AI / Agent** | A coding agent that reads those instructions and applies them |
| **Existing Codebase** | Your application, updated by the agent through the shared layer |

### Flow

```text
[CMSy App] --> [CMSy MCP] --> [AI / Agent] --> [Existing Codebase]
```

### Core idea

CMSy does not replace your existing codebase.

Instead, it provides an interface for humans and agents to work with the codebase through a shared layer.

The **CMSy MCP** acts as the bridge between CMSy and the development environment. This allows CMSy to understand and manipulate things that already exist in the application — rather than forcing developers to migrate everything into a traditional CMS.

## Features

### Component Editor

Build and modify UI components using AI.

Instead of manually writing every component from scratch, developers can describe what they want and iterate on the component directly inside CMSy.

### No-Code Editor

Edit application content without touching the underlying code.

Examples include:

- Blog posts
- Landing-page content
- Text
- Images
- Structured content
- Other editable application data

### Agent-readable changes

CMSy produces structured, copyable instructions that an AI coding agent can understand.

This makes it possible to move from:

```text
Design / Edit → Structured instruction → Agent → Codebase
```

## Design system

A space's visual rules live in [`DESIGN.md`](./DESIGN.md) — colours, type scale, radii and the
guidelines prose. The Design area of a space renders that file, so editing DESIGN.md *is* how
you change the design system; there is nothing to keep in sync by hand.

`scripts/sync-design.mjs` turns it into `app/dashboard/[space]/design.generated.json`, which is
committed so both bundlers can import it without a loader. It runs automatically before `dev`
and `build`; to regenerate on its own:

```bash
npm run design:sync
```

## Running the MCP server

The CMSy MCP server is served by the app itself, over Streamable HTTP at
`/api/mcp`. There is no separate process to start — run the app and the
endpoint is live.

```bash
neon env pull   # writes .env.local with DATABASE_URL
npm run db:push # apply db/schema.sql
npm run dev     # MCP server at http://localhost:3000/api/mcp (Next)
npm run dev:vinext  # ...or http://localhost:3001/api/mcp (Cloudflare runtime)
```

Deployed on Cloudflare Workers at
`https://cmsy.webdesignbyft.workers.dev/api/mcp`.

### Connecting an agent

Start the app, open **[/dashboard/connect](http://localhost:3000/dashboard/connect)**,
and paste. The page shows the endpoint for whatever URL you reached it on — loopback,
the vinext port, or the deployed hostname — with ready-to-paste config for Claude Code,
Cursor/VS Code and plain `curl`, each behind a copy button.

If the host is not loopback the page also issues the bearer token those snippets need,
and fills them in with it. That is the whole flow: **start the app → open the page →
paste.**

The checked-in `.mcp.json` still points at `http://localhost:3000/api/mcp`, so agents
that read project-level MCP config (Claude Code, Cursor, Codex) attach automatically
when started from the repo root. It stays on loopback deliberately — it is a dev
convenience, not the onboarding path, which is how no secret ends up committed.

Verify a connection without an agent:

```bash
npm run mcp:smoke                                    # localhost:3000
node scripts/mcp-smoke.mjs http://localhost:3001/api/mcp
node scripts/mcp-smoke.mjs https://<your-deploy>/api/mcp cmsy_<token>
```

It runs a real `initialize` + `tools/list` round trip over Streamable HTTP and exits
non-zero on the first failure.

### Tools

| Tool | Description |
| --- | --- |
| `list_spaces` | Lists every space — a CMSy project, owning its own pages, components and design system. Read-only. |

Tool definitions live in `mcp/server.ts`, deliberately free of Next.js
imports so the same tools can later be served from a stdio process.
`app/api/mcp/route.ts` is only the HTTP glue.

### Auth

Local dev (loopback hosts) needs no token — the checked-in `.mcp.json` connects in one
step. Any non-loopback host requires a bearer token, and there are two kinds.

**Issued tokens (preferred).** Create them at `/dashboard/connect`. They are shown once,
stored only as a SHA-256 hash, and checked against the database on every request, so the
page can show a last-used time and revoke one with immediate effect. Because the token is
already 256 bits of randomness, a single unsalted SHA-256 is the right hash here — there
is no dictionary to defend against, and the digest has to be deterministic to look the
token up.

> **A public deploy is not safe until sign-in lands (#21).** Issuing a token requires no
> authentication, so anyone who can load `/dashboard/connect` can mint a credential for
> `/api/mcp`. Set `MCP_AUTH_TOKEN` on the Worker as well, so the endpoint does not depend
> on the dashboard alone, and keep the deploy private until #21 is done.

**`MCP_AUTH_TOKEN` (legacy fallback).** A single shared secret, kept working so
deployments that predate issuance do not break:

```bash
openssl rand -hex 32   # generate once, then add to .env.local:
# MCP_AUTH_TOKEN=<output>
```

The same variable must be set where the app is deployed (e.g.
`wrangler secret put MCP_AUTH_TOKEN`). It has no owner, no last-used time and cannot be
revoked without a redeploy — prefer an issued token. Retiring it is tracked in #24.

Either way, register the server with an `Authorization` header (VS Code reads `servers`
where Cursor and Claude Code read `mcpServers`):

```json
{
  "mcpServers": {
    "cmsy": {
      "type": "http",
      "url": "https://<your-deploy>/api/mcp",
      "headers": { "Authorization": "Bearer <token>" }
    }
  }
}
```

Unauthenticated calls get a `401` + `WWW-Authenticate: Bearer` challenge; requests with a
forged `Origin` get `403`. Unknown and revoked tokens are both answered `401` with the
same message, so a caller cannot probe which of its tokens still exist.

Tokens are not yet per-user in any real sense: CMSy has no sign-in flow, so every token
belongs to whoever can open the dashboard. The `owner` column exists for when #24 starts
writing the Neon Auth subject into it.

## Why CMSy?

Traditional CMSs generally separate content from the application's codebase.

AI coding agents can modify code, but they are not necessarily designed around non-technical content editing.

CMSy explores the middle ground: **a CMS for codebases that are increasingly built and maintained by AI agents.**