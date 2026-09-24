import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
// Relative, not `@/db`: this module is deliberately framework-free so a stdio
// entry point can import it from a plain Node process, where the `@/*` alias
// that Next's bundler resolves is not available.
import {
  createComponent,
  createSpace,
  deleteComponent,
  findComponent,
  getDesignSystem,
  getPage,
  getSpace,
  importComponent,
  LIMITS,
  listComponents,
  listImportable,
  listPages,
  listRecentActivity,
  listSpaces,
  pageHtml,
  setPageHtml,
} from "../db";
// The leaf module, not `../db`: it is pure and import-free, so a test that
// replaces the database functions still exercises the real checker.
import { pageHtmlProblems } from "../db/page-html";

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
function toolError(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

function spaceNotFound(slug: string) {
  return toolError(`No space with slug "${slug}". Call list_spaces to see the slugs that exist.`);
}

function pageNotFound(slug: string, spaceName: string) {
  return toolError(
    `No page with slug "${slug}" in ${spaceName}. Call list_pages to see the slugs that exist.`,
  );
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

const getSpaceOutput = z.object({
  name: z.string(),
  slug: z.string(),
  pages: z.number().int(),
  components: z.number().int(),
  designSystem: z.string().nullable(),
  dashboardPath: z.string(),
});

function registerGetSpace(server: McpServer) {
  server.registerTool(
    "get_space",
    {
      title: "Get space",
      description:
        "Read one space by slug: its name, how many pages and components it has, " +
        "and the name of the design system it uses.",
      inputSchema: spaceInput,
      outputSchema: getSpaceOutput,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ space: slug }) => {
      const space = await getSpace(slug);
      if (!space) return spaceNotFound(slug);

      const structured = {
        name: space.name,
        slug: space.slug,
        pages: space.page_count,
        components: space.component_count,
        designSystem: space.design_system_name,
        dashboardPath: `/dashboard/${space.slug}`,
      };

      return {
        content: [
          {
            type: "text" as const,
            text:
              `${structured.name} (${structured.slug}) — ${structured.pages} pages, ` +
              `${structured.components} components, design system: ${structured.designSystem ?? "none"}`,
          },
        ],
        structuredContent: structured,
      };
    },
  );
}

const createSpaceOutput = z.object({
  name: z.string(),
  slug: z.string(),
  dashboardPath: z.string(),
});

function registerCreateSpace(server: McpServer) {
  server.registerTool(
    "create_space",
    {
      title: "Create space",
      description:
        "Create a new space, with its own design system selected. The slug is " +
        "derived from the name and gets a numeric suffix if it is taken, so use " +
        "the slug this returns rather than guessing it.",
      inputSchema: z.object({
        name: z.string().trim().min(1).max(LIMITS.spaceName).describe("Display name for the space."),
      }),
      outputSchema: createSpaceOutput,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ name }) => {
      const row = await createSpace(name);
      if (!row) return toolError(`Could not find a free slug for "${name}". Try a different name.`);

      const structured = { name, slug: row.slug, dashboardPath: `/dashboard/${row.slug}` };
      return {
        content: [{ type: "text" as const, text: `Created space ${name} (${row.slug}).` }],
        structuredContent: structured,
      };
    },
  );
}

const componentResult = z.object({
  space: spaceRef,
  component: z.object({ id: z.string(), name: z.string() }),
});

function registerCreateComponent(server: McpServer) {
  server.registerTool(
    "create_component",
    {
      title: "Create component",
      description:
        "Add a component to a space. Names are unique within a space; if the " +
        "name is taken, nothing is changed and the call returns an error.",
      inputSchema: spaceInput.extend({
        name: z.string().trim().min(1).max(LIMITS.componentName).describe("Component name, e.g. PricingCard."),
        description: z
          .string()
          .trim()
          .max(LIMITS.componentDescription)
          .default("")
          .describe("One line on what the component is for."),
      }),
      outputSchema: componentResult,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ space: slug, name, description }) => {
      const space = await getSpace(slug);
      if (!space) return spaceNotFound(slug);

      const row = await createComponent(space.id, name, description);
      if (!row) return toolError(`${space.name} already has a component named "${name}".`);

      return {
        content: [{ type: "text" as const, text: `Created ${name} in ${space.name}.` }],
        structuredContent: {
          space: { name: space.name, slug: space.slug },
          component: { id: row.id, name },
        },
      };
    },
  );
}

function registerDeleteComponent(server: McpServer) {
  server.registerTool(
    "delete_component",
    {
      title: "Delete component",
      description:
        "Delete a component from a space, by name. This cannot be undone. Copies " +
        "other spaces imported from it are kept, but lose their link to it.",
      inputSchema: spaceInput.extend({
        component: z.string().min(1).describe("The component's name, as returned by list_components."),
      }),
      outputSchema: componentResult,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ space: slug, component: name }) => {
      const space = await getSpace(slug);
      if (!space) return spaceNotFound(slug);

      const found = await findComponent(space.id, name);
      if (!found || !(await deleteComponent(space.id, found.id))) {
        return toolError(`${space.name} has no component named "${name}". Call list_components to see them.`);
      }

      return {
        content: [{ type: "text" as const, text: `Deleted ${found.name} from ${space.name}.` }],
        structuredContent: {
          space: { name: space.name, slug: space.slug },
          component: found,
        },
      };
    },
  );
}

const listImportableOutput = z.object({
  space: spaceRef,
  count: z.number().int(),
  components: z.array(
    z.object({ id: z.string(), name: z.string(), fromSpace: spaceRef }),
  ),
});

function registerListImportable(server: McpServer) {
  server.registerTool(
    "list_importable",
    {
      title: "List importable components",
      description:
        "List components in other spaces that this space has not imported yet, " +
        "with the space each one lives in. Pass one to import_component.",
      inputSchema: spaceInput,
      outputSchema: listImportableOutput,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ space: slug }) => {
      const space = await getSpace(slug);
      if (!space) return spaceNotFound(slug);

      const rows = await listImportable(space.id);
      const structured = {
        space: { name: space.name, slug: space.slug },
        count: rows.length,
        components: rows.map((c) => ({
          id: c.id,
          name: c.name,
          fromSpace: { name: c.space_name, slug: c.space_slug },
        })),
      };

      return {
        content: [
          {
            type: "text" as const,
            text: structured.count
              ? structured.components.map((c) => `${c.name} (from ${c.fromSpace.slug})`).join("\n")
              : `Nothing left to import into ${space.name}.`,
          },
        ],
        structuredContent: structured,
      };
    },
  );
}

function registerImportComponent(server: McpServer) {
  server.registerTool(
    "import_component",
    {
      title: "Import component",
      description:
        "Copy a component from another space into this one. The copy keeps a " +
        "link to its original, which list_components reports as importedFrom. " +
        "Fails if this space already has a component with the same name.",
      inputSchema: spaceInput.extend({
        fromSpace: z.string().min(1).describe("Slug of the space the component lives in now."),
        component: z.string().min(1).describe("The component's name in that space."),
      }),
      outputSchema: componentResult,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ space: slug, fromSpace: fromSlug, component: name }) => {
      if (slug === fromSlug) return toolError("A component cannot be imported into the space it is in.");

      const [space, from] = await Promise.all([getSpace(slug), getSpace(fromSlug)]);
      if (!space) return spaceNotFound(slug);
      if (!from) return spaceNotFound(fromSlug);

      const source = await findComponent(from.id, name);
      if (!source) {
        return toolError(`${from.name} has no component named "${name}". Call list_importable to see candidates.`);
      }

      const row = await importComponent(space.id, source.id);
      if (!row) return toolError(`${space.name} already has a component named "${source.name}".`);

      return {
        content: [{ type: "text" as const, text: `Imported ${row.name} from ${from.name} into ${space.name}.` }],
        structuredContent: {
          space: { name: space.name, slug: space.slug },
          component: row,
        },
      };
    },
  );
}

const listRecentActivityOutput = z.object({
  count: z.number().int(),
  items: z.array(
    z.object({
      kind: z.enum(["page", "component"]),
      title: z.string(),
      createdAt: z.string(),
      space: spaceRef,
    }),
  ),
});

function registerListRecentActivity(server: McpServer) {
  server.registerTool(
    "list_recent_activity",
    {
      title: "List recent activity",
      description:
        "The newest pages and components across every space, newest first — " +
        "the dashboard's activity list.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(50).default(5).describe("How many items, 1–50."),
      }),
      outputSchema: listRecentActivityOutput,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ limit }) => {
      const rows = await listRecentActivity(limit);
      const structured = {
        count: rows.length,
        items: rows.map((item) => ({
          kind: item.kind,
          title: item.title,
          createdAt: new Date(item.created_at).toISOString(),
          space: { name: item.space_name, slug: item.space_slug },
        })),
      };

      return {
        content: [
          {
            type: "text" as const,
            text: structured.count
              ? structured.items.map((i) => `${i.kind} ${i.title} in ${i.space.slug} — ${i.createdAt}`).join("\n")
              : "No activity yet.",
          },
        ],
        structuredContent: structured,
      };
    },
  );
}

/**
 * A page is addressed the way an agent already has it: the space slug from
 * `list_spaces`, the page slug from `list_pages`.
 */
const pageInput = spaceInput.extend({
  page: z.string().min(1).describe("The page's slug, as returned by list_pages."),
});

const pageRef = z.object({ id: z.string(), title: z.string(), slug: z.string() });

const pageBodyOutput = z.object({
  space: spaceRef,
  page: pageRef,
  html: z.string(),
});

function registerGetPage(server: McpServer) {
  server.registerTool(
    "get_page",
    {
      title: "Get page",
      description:
        "Read one page's document body as HTML, by space and page slug. The body " +
        "is the markup the editor edits: paragraphs, headings, lists, links, " +
        "images and component blocks. Read it before changing a page, and send " +
        "the whole document back to set_page_blocks to write it.",
      inputSchema: pageInput,
      outputSchema: pageBodyOutput,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ space: slug, page: pageSlug }) => {
      const space = await getSpace(slug);
      if (!space) return spaceNotFound(slug);

      const page = await getPage(space.id, pageSlug);
      if (!page) return pageNotFound(pageSlug, space.name);

      const html = pageHtml(page.blocks);
      return {
        content: [{ type: "text" as const, text: html || `${page.title} is empty.` }],
        structuredContent: {
          space: { name: space.name, slug: space.slug },
          page: { id: page.id, title: page.title, slug: page.slug },
          html,
        },
      };
    },
  );
}

const setPageBodyOutput = z.object({
  space: spaceRef,
  page: pageRef,
  characters: z.number().int(),
  replaced: z.boolean(),
});

function registerSetPageBlocks(server: McpServer) {
  server.registerTool(
    "set_page_blocks",
    {
      title: "Set page blocks",
      description:
        "Replace a page's entire document body with HTML, by space and page slug. " +
        "This replaces rather than merges, so read the page with get_page first " +
        "and send back the full document. Markup the editor cannot keep is " +
        "refused with the reason, instead of being saved and then silently " +
        "dropped the next time someone opens the page.",
      inputSchema: pageInput.extend({
        html: z.string().describe("The complete document body, as HTML."),
      }),
      outputSchema: setPageBodyOutput,
      // Replaces content rather than adding to it, so it is destructive even
      // though sending the same document twice leaves the same document.
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ space: slug, page: pageSlug, html }) => {
      const space = await getSpace(slug);
      if (!space) return spaceNotFound(slug);

      const page = await getPage(space.id, pageSlug);
      if (!page) return pageNotFound(pageSlug, space.name);

      const problems = pageHtmlProblems(html);
      if (problems.length) {
        return toolError(
          `The editor cannot keep all of that, so nothing was saved:\n- ${problems.join("\n- ")}`,
        );
      }

      // Refused rather than trimmed: `setPageHtml` caps the body, and a document
      // cut at an arbitrary offset can split a tag or an escaped attribute. A
      // caller that is told nothing would have no way to know its write was
      // mangled, which is worse than a refusal it can shorten and retry.
      if (html.length > LIMITS.pageBody) {
        return toolError(
          `That document is ${html.length} characters; a page holds ${LIMITS.pageBody}. ` +
            "Nothing was saved — split it across pages, or trim it and try again.",
        );
      }

      const replaced = await setPageHtml(page.id, html);
      return {
        content: [
          { type: "text" as const, text: `Saved ${page.title} in ${space.name} (${html.length} characters).` },
        ],
        structuredContent: {
          space: { name: space.name, slug: space.slug },
          page: { id: page.id, title: page.title, slug: page.slug },
          characters: html.length,
          replaced,
        },
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
  registerGetPage(server);
  registerSetPageBlocks(server);
  registerListComponents(server);
  registerGetDesignSystem(server);
  registerGetSpace(server);
  registerCreateSpace(server);
  registerCreateComponent(server);
  registerDeleteComponent(server);
  registerListImportable(server);
  registerImportComponent(server);
  registerListRecentActivity(server);
  return server;
}
