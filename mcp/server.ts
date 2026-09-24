import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
// Relative, not `@/db`: this module is deliberately framework-free so a stdio
// entry point can import it from a plain Node process, where the `@/*` alias
// that Next's bundler resolves is not available.
import { getSpace, listComponents, listPages, listSpaces } from "../db";

export const SERVER_INFO = {
  name: "cmsy",
  title: "CMSy",
  version: "0.1.0",
} as const;

/**
 * A CMSy space is the top-level container an agent works against — the thing
 * the Linear project calls a "project". Each one owns its pages, components
 * and design system, so listing spaces is how a connected agent orients
 * itself before touching anything.
 */
const spaceShape = z.object({
  name: z.string(),
  slug: z.string(),
  pages: z.number().int(),
  components: z.number().int(),
  designSystem: z.string().nullable(),
  updatedAt: z.string(),
  dashboardPath: z.string(),
});

const listSpacesOutput = z.object({
  count: z.number().int(),
  spaces: z.array(spaceShape),
});

function registerListSpaces(server: McpServer) {
  server.registerTool(
    "list_spaces",
    {
      title: "List spaces",
      description:
        "List every space in this CMSy instance. A space is a CMSy project: " +
        "the top-level container that owns its own pages, components and " +
        "design system. Call this first to discover what exists before " +
        "reading or changing anything.",
      outputSchema: listSpacesOutput,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async () => {
      const rows = await listSpaces();
      const structured = {
        count: rows.length,
        spaces: rows.map((s) => ({
          name: s.name,
          slug: s.slug,
          pages: s.page_count,
          components: s.component_count,
          designSystem: s.design_system_name,
          updatedAt: new Date(s.updated_at).toISOString(),
          dashboardPath: `/dashboard/${s.slug}`,
        })),
      };

      return {
        // Text mirrors the structured payload: clients that ignore
        // structuredContent still get something readable.
        content: [
          {
            type: "text" as const,
            text: structured.count
              ? structured.spaces
                  .map(
                    (s) =>
                      `${s.name} (${s.slug}) — ${s.pages} pages, ${s.components} components` +
                      `, design system: ${s.designSystem ?? "none"}`,
                  )
                  .join("\n")
              : "No spaces yet. Create one at /dashboard.",
          },
        ],
        structuredContent: structured,
      };
    },
  );
}

/**
 * Every per-space tool takes the slug `list_spaces` returns, not the UUID, so
 * an agent can chain the two calls without holding onto ids.
 */
const spaceInput = z.object({
  space: z.string().min(1).describe("The space's slug, as returned by list_spaces."),
});

const spaceRef = z.object({ name: z.string(), slug: z.string() });

/**
 * An unknown slug is the agent's mistake, not a server fault, so it comes back
 * as a tool error the model can read and correct rather than a protocol error.
 */
function spaceNotFound(slug: string) {
  return {
    content: [
      {
        type: "text" as const,
        text: `No space with slug "${slug}". Call list_spaces to see the slugs that exist.`,
      },
    ],
    isError: true,
  };
}

const listPagesOutput = z.object({
  space: spaceRef,
  count: z.number().int(),
  pages: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      slug: z.string(),
      createdAt: z.string(),
    }),
  ),
});

function registerListPages(server: McpServer) {
  server.registerTool(
    "list_pages",
    {
      title: "List pages",
      description:
        "List the pages in one space, oldest first: id, title, slug and when " +
        "each was created. Page content is not included — nothing stores it yet.",
      inputSchema: spaceInput,
      outputSchema: listPagesOutput,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ space: slug }) => {
      const space = await getSpace(slug);
      if (!space) return spaceNotFound(slug);

      const rows = await listPages(space.id);
      const structured = {
        space: { name: space.name, slug: space.slug },
        count: rows.length,
        pages: rows.map((p) => ({
          id: p.id,
          title: p.title,
          slug: p.slug,
          createdAt: new Date(p.created_at).toISOString(),
        })),
      };

      return {
        content: [
          {
            type: "text" as const,
            text: structured.count
              ? structured.pages.map((p) => `${p.title} (${p.slug})`).join("\n")
              : `${space.name} has no pages yet.`,
          },
        ],
        structuredContent: structured,
      };
    },
  );
}

const listComponentsOutput = z.object({
  space: spaceRef,
  count: z.number().int(),
  components: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      importedFrom: z
        .object({ component: z.string(), space: z.string().nullable() })
        .nullable(),
    }),
  ),
});

function registerListComponents(server: McpServer) {
  server.registerTool(
    "list_components",
    {
      title: "List components",
      description:
        "List the components in one space, oldest first: name and description. " +
        "`importedFrom` is set when a component was imported from another space " +
        "rather than authored in this one, and names where it came from.",
      inputSchema: spaceInput,
      outputSchema: listComponentsOutput,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ space: slug }) => {
      const space = await getSpace(slug);
      if (!space) return spaceNotFound(slug);

      const rows = await listComponents(space.id);
      const structured = {
        space: { name: space.name, slug: space.slug },
        count: rows.length,
        components: rows.map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          // Deleting the original clears `origin_component_id` (`on delete
          // set null`), so a copy whose source is gone reads as authored here.
          importedFrom: c.origin_name
            ? { component: c.origin_name, space: c.origin_space_name }
            : null,
        })),
      };

      return {
        content: [
          {
            type: "text" as const,
            text: structured.count
              ? structured.components
                  .map(
                    (c) =>
                      c.name +
                      (c.description ? ` — ${c.description}` : "") +
                      (c.importedFrom ? ` (imported from ${c.importedFrom.space})` : ""),
                  )
                  .join("\n")
              : `${space.name} has no components yet.`,
          },
        ],
        structuredContent: structured,
      };
    },
  );
}

/**
 * Built per request: `createMcpHandler` calls this factory for every exchange,
 * so the server instance must not be shared or cached across requests.
 */
export function createCmsyMcpServer(): McpServer {
  const server = new McpServer(SERVER_INFO);
  registerListSpaces(server);
  registerListPages(server);
  registerListComponents(server);
  return server;
}
