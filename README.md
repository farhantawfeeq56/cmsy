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

This repo ships a `.mcp.json`, so agents that read project-level MCP config
(Claude Code, Cursor, Codex) pick the server up automatically when started
from the repo root. To register it by hand:

```bash
claude mcp add --transport http cmsy http://localhost:3000/api/mcp
```

Verify the connection without an agent:

```bash
curl -s -X POST http://localhost:3000/api/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

### Tools

| Tool | Description |
| --- | --- |
| `list_spaces` | Lists every space — a CMSy project, owning its own pages, components and design system. Read-only. |

Tool definitions live in `mcp/server.ts`, deliberately free of Next.js
imports so the same tools can later be served from a stdio process.
`app/api/mcp/route.ts` is only the HTTP glue.

### Auth

Local dev (loopback hosts) needs no token — the checked-in `.mcp.json`
connects in one step. Any non-loopback host requires a bearer token:

```bash
openssl rand -hex 32   # generate once, then add to .env.local:
# MCP_AUTH_TOKEN=<output>
```

The same variable must be set where the app is deployed (e.g.
`wrangler secret put MCP_AUTH_TOKEN`). Without it the deployed endpoint
refuses every non-loopback request with `401` rather than serving openly.

To connect an agent to a deployed instance, register the server with an
`Authorization` header:

```json
{
  "mcpServers": {
    "cmsy": {
      "type": "http",
      "url": "https://<your-deploy>/api/mcp",
      "headers": { "Authorization": "Bearer <MCP_AUTH_TOKEN>" }
    }
  }
}
```

Unauthenticated calls get a `401` + `WWW-Authenticate: Bearer` challenge;
requests with a forged `Origin` get `403`. The token is a shared secret
(there is no login flow issuing per-user tokens yet) — rotate it with
`openssl rand` and update the secret wherever it is stored.

## Why CMSy?

Traditional CMSs generally separate content from the application's codebase.

AI coding agents can modify code, but they are not necessarily designed around non-technical content editing.

CMSy explores the middle ground: **a CMS for codebases that are increasingly built and maintained by AI agents.**