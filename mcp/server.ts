import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
// Relative, not `@/db`: this module is deliberately framework-free so a stdio
// entry point can import it from a plain Node process, where the `@/*` alias
// that Next's bundler resolves is not available.
import { getDesignSystem, getSpace, listComponents, listPages, listSpaces } from "../db";

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

const getDesignSystemOutput = z.object({
  space: spaceRef,
  designSystem: z
    .object({
      name: z.string(),
      ownedBy: spaceRef.nullable(),
      importedFromAnotherSpace: z.boolean(),
      tokenCount: z.number().int(),
      tokens: z.record(z.string(), z.unknown()),
    })
    .nullable(),
});

/** Entries across the token groups; a bare top-level value counts as one. */
function countTokens(tokens: Record<string, unknown>) {
  return Object.values(tokens).reduce<number>(
    (sum, group) =>
      sum + (typeof group === "object" && group !== null ? Object.keys(group).length : 1),
    0,
  );
}

function registerGetDesignSystem(server: McpServer) {
  server.registerTool(
    "get_design_system",
    {
      title: "Get design system",
      description:
        "Read the design system one space uses, with its tokens. Call this before " +
        "building or styling a component so it follows the space's colours, type " +
        "and spacing instead of guessing. Tokens are grouped (colors, typography, " +
        "rounded, spacing, components); a value like `{colors.primary}` refers to " +
        "another token. A space can use a system another space owns — `ownedBy` " +
        "says whose it is, and editing it would change every space that uses it.",
      inputSchema: spaceInput,
      outputSchema: getDesignSystemOutput,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ space: slug }) => {
      const space = await getSpace(slug);
      if (!space) return spaceNotFound(slug);

      const ref = { name: space.name, slug: space.slug };
      const system = space.design_system_id ? await getDesignSystem(space.design_system_id) : null;

      if (!system) {
        return {
          content: [{ type: "text" as const, text: `${space.name} has no design system selected.` }],
          structuredContent: { space: ref, designSystem: null },
        };
      }

      const ownedBy = system.owner_space_slug
        ? { name: system.owner_space_name ?? system.owner_space_slug, slug: system.owner_space_slug }
        : null;
      const imported = system.owner_space_id !== null && system.owner_space_id !== space.id;
      const tokenCount = countTokens(system.tokens);

      const structured = {
        space: ref,
        designSystem: {
          name: system.name,
          ownedBy,
          importedFromAnotherSpace: imported,
          tokenCount,
          tokens: system.tokens,
        },
      };

      const origin = imported && ownedBy ? `, shared from ${ownedBy.name} (${ownedBy.slug})` : "";
      // An empty object must not read as "this space has no visual rules" — say
      // plainly that none are recorded, so an agent asks instead of inventing.
      const body = tokenCount
        ? JSON.stringify(system.tokens, null, 2)
        : "No tokens are recorded for this design system yet.";

      return {
        content: [
          {
            type: "text" as const,
            text: `${space.name} uses "${system.name}"${origin} — ${tokenCount} tokens.\n\n${body}`,
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
  registerGetDesignSystem(server);
  return server;
}
