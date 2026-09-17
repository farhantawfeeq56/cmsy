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

## Why CMSy?

Traditional CMSs generally separate content from the application's codebase.

AI coding agents can modify code, but they are not necessarily designed around non-technical content editing.

CMSy explores the middle ground: **a CMS for codebases that are increasingly built and maintained by AI agents.**