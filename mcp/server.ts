import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
// Relative, not `@/db`: this module is deliberately framework-free so a stdio
// entry point can import it from a plain Node process, where the `@/*` alias
// that Next's bundler resolves is not available.
import { listSpaces } from "../db";

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
 * Built per request: `createMcpHandler` calls this factory for every exchange,
 * so the server instance must not be shared or cached across requests.
 */
export function createCmsyMcpServer(): McpServer {
  const server = new McpServer(SERVER_INFO);
  registerListSpaces(server);
  return server;
}
