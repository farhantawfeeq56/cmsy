import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
// Relative, not `@/db`: this module is deliberately framework-free so a stdio
// entry point can import it from a plain Node process, where the `@/*` alias
// that Next's bundler resolves is not available.
import {
  createComponent,
  createPage,
  createSpace,
  deleteComponent,
  deletePage,
  deleteSpace,
  findComponent,
  getDesignSystem,
  getPage,
  getSpace,
  importComponent,
  LIMITS,
  listComponents,
  listDesignSystems,
  listImportable,
  listPages,
  listRecentActivity,
  listSpaces,
  renamePage,
  renameSpace,
  setPageDoc,
  setSpaceDesignSystem,
  updateComponent,
} from "../db";
// The leaf module, not `../db`: it is pure and import-free, so a test that
// replaces the database functions still exercises the real checker.
import { CLASSES } from "../db/page-html";
// Pure as well, so the tests read and count bodies with the real rules.
import { checkPageDoc, DOC_LIMITS, fromLegacyHtml, readPageDoc, type Block } from "../db/page-doc";
// Also import-free, so a template is judged by the same rules the editor
// enforces rather than by a second copy of them.
import {
  componentProblems,
  parseProps,
  parseTemplate,
  PROP_LIMITS,
  type Prop,
} from "../db/component-template";

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

/**
 * A refusal reads as a list, so a model can fix every problem in one retry. The
 * wording follows `set_page_blocks`, which refuses for the same reason: a caller
 * told nothing has no way to notice its write was mangled.
 */
function refused(problems: string[]) {
  return toolError(`Nothing was saved:\n- ${problems.join("\n- ")}`);
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
        "each was created. Bodies are not included; read one with get_page.",
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

const designSystemSummary = z.object({
  id: z.string(),
  name: z.string(),
  ownedBy: spaceRef.nullable(),
  tokenCount: z.number().int(),
});

const listDesignSystemsOutput = z.object({
  count: z.number().int(),
  designSystems: z.array(designSystemSummary),
});

function registerListDesignSystems(server: McpServer) {
  server.registerTool(
    "list_design_systems",
    {
      title: "List design systems",
      description:
        "List every design system, with the space that owns it and how many " +
        "tokens it records. Every space starts with its own; pass an id from " +
        "here to use_design_system to point a space at another space's.",
      inputSchema: z.object({}),
      outputSchema: listDesignSystemsOutput,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async () => {
      const rows = await listDesignSystems();
      const structured = {
        count: rows.length,
        designSystems: rows.map((d) => ({
          id: d.id,
          name: d.name,
          ownedBy: d.space_slug ? { name: d.space_name ?? d.space_slug, slug: d.space_slug } : null,
          tokenCount: d.token_count,
        })),
      };

      return {
        content: [
          {
            type: "text" as const,
            text: structured.count
              ? structured.designSystems
                  .map(
                    (d) =>
                      `${d.name} (${d.id}) — ${d.tokenCount} tokens, ` +
                      (d.ownedBy ? `owned by ${d.ownedBy.slug}` : "owned by no space"),
                  )
                  .join("\n")
              : "No design systems yet.",
          },
        ],
        structuredContent: structured,
      };
    },
  );
}

const useDesignSystemOutput = z.object({
  space: spaceRef,
  designSystem: designSystemSummary,
});

function registerUseDesignSystem(server: McpServer) {
  server.registerTool(
    "use_design_system",
    {
      title: "Use design system",
      description:
        "Point a space at a design system — its own, or one another space owns. " +
        "Take the id from list_design_systems. The space's previous system is " +
        "not deleted, so pointing back undoes this. A shared system is shared, " +
        "not copied: get_design_system will report the space that owns it.",
      inputSchema: spaceInput.extend({
        designSystemId: z.uuid().describe("The design system's id, as returned by list_design_systems."),
      }),
      outputSchema: useDesignSystemOutput,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ space: slug, designSystemId }) => {
      const space = await getSpace(slug);
      if (!space) return spaceNotFound(slug);

      const system = await getDesignSystem(designSystemId);
      if (!system) {
        return toolError(`No design system with id "${designSystemId}". Call list_design_systems to see them.`);
      }

      // The system can be deleted between the lookup and the write; the
      // write checks again and reports that rather than claiming success.
      if (!(await setSpaceDesignSystem(space.id, system.id))) {
        return toolError(`${space.name} could not be pointed at "${system.name}"; it no longer exists.`);
      }

      const ownedBy = system.owner_space_slug
        ? { name: system.owner_space_name ?? system.owner_space_slug, slug: system.owner_space_slug }
        : null;
      const origin = ownedBy && system.owner_space_id !== space.id ? `, shared from ${ownedBy.name}` : "";

      return {
        content: [{ type: "text" as const, text: `${space.name} now uses "${system.name}"${origin}.` }],
        structuredContent: {
          space: { name: space.name, slug: space.slug },
          designSystem: {
            id: system.id,
            name: system.name,
            ownedBy,
            tokenCount: countTokens(system.tokens),
          },
        },
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

/**
 * What a component declares: the props a page fills in, and the template that
 * turns them into markup. Both are optional on every write and only what is
 * sent is written, because an agent cannot read a component back over MCP —
 * `list_components` returns names, not templates. Lengths are capped here as
 * well as in the parser so an over-long value is refused rather than sliced.
 */
const componentProps = z
  .array(
    z.object({
      key: z
        .string()
        .max(PROP_LIMITS.key)
        .describe("Identifier the template fills as {{key}}."),
      label: z
        .string()
        .max(PROP_LIMITS.label)
        .default("")
        .describe("Field label in the page inspector. Defaults to the key."),
      fallback: z
        .string()
        .max(PROP_LIMITS.fallback)
        .default("")
        .describe("Text a page shows until it sets its own."),
    }),
  )
  .max(PROP_LIMITS.count)
  .describe(`The props the component declares, up to ${PROP_LIMITS.count}.`);

const componentTemplate = z
  .string()
  .max(PROP_LIMITS.template)
  .describe(
    "HTML that renders the props, with {{key}} in text — never inside a tag. " +
      "Only the tags a page document allows survive, plus the design system's " +
      `own classes (${[...CLASSES].join(", ")}) and no others.`,
  );

/** What a write left stored, so a caller can see it without a read tool. */
const componentDeclared = z.object({
  props: z.array(z.object({ key: z.string(), label: z.string(), fallback: z.string() })),
  template: z.string(),
});

const componentWriteOutput = componentResult.extend({ declared: componentDeclared });

/**
 * The props and template a write is giving a component, or the reasons it could
 * not be saved. `undefined` comes back as `null`, meaning "leave that column".
 *
 * Refused rather than trimmed, the way `set_page_blocks` refuses: a prop the
 * parser would drop and markup the editor would strip both come back as
 * problems.
 *
 * `stored` is what the component already declares, and the two are checked as
 * the pair they will be rendered as — not just the half that was sent. Sending
 * props alone would otherwise skip the check, and a renamed prop would leave the
 * stored template pointing at a name nothing declares, so the component would
 * quietly stop rendering with nothing said at write time.
 */
function declaredFields(
  input: { props?: Prop[]; template?: string },
  stored: { props: Prop[]; template: string } = { props: [], template: "" },
) {
  const problems: string[] = [];
  let props: Prop[] | null = null;

  if (input.props !== undefined) {
    props = parseProps(input.props);
    const dropped = input.props.length - props.length;
    if (dropped) {
      problems.push(
        `${dropped} of ${input.props.length} props would be dropped: a key must match ` +
          "[a-zA-Z][a-zA-Z0-9_-]* and be unique within the component",
      );
    }
  }

  const template = input.template === undefined ? null : parseTemplate(input.template);
  if (props !== null || template !== null) {
    problems.push(...componentProblems(props ?? stored.props, template ?? stored.template));
  }

  return { problems, props, template };
}

function registerCreateComponent(server: McpServer) {
  server.registerTool(
    "create_component",
    {
      title: "Create component",
      description:
        "Add a component to a space. Names are unique within a space; if the " +
        "name is taken, nothing is changed and the call returns an error. A " +
        "component renders only once it declares props and a template, so send " +
        "both here or with update_component — with neither it cannot be " +
        "inserted into a page.",
      inputSchema: spaceInput.extend({
        name: z.string().trim().min(1).max(LIMITS.componentName).describe("Component name, e.g. PricingCard."),
        description: z
          .string()
          .trim()
          .max(LIMITS.componentDescription)
          .default("")
          .describe("One line on what the component is for."),
        props: componentProps.optional(),
        template: componentTemplate.optional(),
      }),
      outputSchema: componentWriteOutput,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ space: slug, name, description, props, template }) => {
      const space = await getSpace(slug);
      if (!space) return spaceNotFound(slug);

      const declared = declaredFields({ props, template });
      if (declared.problems.length) return refused(declared.problems);

      const row = await createComponent(
        space.id,
        name,
        description,
        declared.props ?? [],
        declared.template ?? "",
      );
      if (!row) return toolError(`${space.name} already has a component named "${name}".`);

      const written = { props: declared.props ?? [], template: declared.template ?? "" };
      return {
        content: [
          {
            type: "text" as const,
            text:
              `Created ${name} in ${space.name}` +
              (written.template
                ? "."
                : " with no template yet, so it cannot be inserted into a page until update_component gives it one."),
          },
        ],
        structuredContent: {
          space: { name: space.name, slug: space.slug },
          component: { id: row.id, name },
          declared: written,
        },
      };
    },
  );
}

function registerUpdateComponent(server: McpServer) {
  server.registerTool(
    "update_component",
    {
      title: "Update component",
      description:
        "Give a component the props it declares and the template that renders " +
        "them, by name. Only what you send is written, so a template can be " +
        "replaced without re-sending the props; a template is judged against the " +
        "props it will render with. Nothing is saved if either would not survive " +
        "the editor — the reasons come back instead.",
      inputSchema: spaceInput.extend({
        component: z.string().min(1).describe("The component's name, as returned by list_components."),
        props: componentProps.optional(),
        template: componentTemplate.optional(),
      }),
      outputSchema: componentWriteOutput,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ space: slug, component: name, props, template }) => {
      const space = await getSpace(slug);
      if (!space) return spaceNotFound(slug);

      if (props === undefined && template === undefined) {
        return toolError("Send `props`, `template`, or both — there is nothing to update.");
      }

      const found = await findComponent(space.id, name);
      if (!found) {
        return toolError(
          `${space.name} has no component named "${name}". Call list_components to see the names that exist.`,
        );
      }

      const stored = parseProps(found.props);
      const declared = declaredFields(
        { props, template },
        { props: stored, template: found.template },
      );
      if (declared.problems.length) return refused(declared.problems);

      // False when the row no longer matches the id and space, which is what a
      // delete between the lookup above and here looks like. Reporting success
      // then would be a write this tool never made.
      if (!(await updateComponent(space.id, found.id, declared.props, declared.template))) {
        return toolError(
          `${found.name} was removed from ${space.name} while this call was in flight. Call list_components to see what is left.`,
        );
      }

      return {
        content: [{ type: "text" as const, text: `Updated ${found.name} in ${space.name}.` }],
        structuredContent: {
          space: { name: space.name, slug: space.slug },
          component: { id: found.id, name: found.name },
          declared: {
            props: declared.props ?? stored,
            template: declared.template ?? found.template,
          },
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
          component: { id: found.id, name: found.name },
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
  doc: z.record(z.string(), z.unknown()),
});

/**
 * The block types, as an agent needs to write them. The rules themselves live
 * in `db/page-doc`; this is only the description of them.
 */
const BLOCK_GUIDE =
  "A page body is { version: 2, root: { props: {} }, content: Block[] }. Each block is " +
  "{ type, props } and every block's props carry a unique string id. The types are: " +
  "Text { id, text } where text is HTML — paragraphs, headings, lists, quotes, links, " +
  "bold/italic/underline and images, with no classes, data- attributes or divs; " +
  "Image { id, src, alt }; Section { id, content: Block[] }; " +
  "Columns { id, left: Block[], right: Block[] }; and " +
  "Component { id, componentId, values } where componentId is from list_components and " +
  "values maps the component's prop keys to strings. " +
  `Blocks nest at most ${DOC_LIMITS.depth} deep, and a page holds at most ${DOC_LIMITS.blocks}.`;

/** Shared by every tool that writes a page body, so a refusal reads the same. */
function bodyRefused(problems: string[]) {
  return toolError(`The editor cannot keep all of that, so nothing was saved:\n- ${problems.join("\n- ")}`);
}

/** The body fields `set_page_blocks` and `create_page` both take. */
const bodyInput = {
  doc: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("The complete page body, as blocks. Send this or html, not both."),
  html: z
    .string()
    .optional()
    .describe("A complete body as HTML, converted to blocks. Send this or doc, not both."),
};

const countBlocks = (content: Block[]): number =>
  content.reduce(
    (total, block) =>
      total +
      1 +
      (block.type === "Section"
        ? countBlocks(block.props.content)
        : block.type === "Columns"
          ? countBlocks(block.props.left) + countBlocks(block.props.right)
          : 0),
    0,
  );

function registerGetPage(server: McpServer) {
  server.registerTool(
    "get_page",
    {
      title: "Get page",
      description:
        "Read one page's body as blocks, by space and page slug. A page saved " +
        "before blocks existed comes back converted. Read it before changing a " +
        "page, and send the whole body back to set_page_blocks to write it. " +
        BLOCK_GUIDE,
      inputSchema: pageInput,
      outputSchema: pageBodyOutput,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ space: slug, page: pageSlug }) => {
      const space = await getSpace(slug);
      if (!space) return spaceNotFound(slug);

      const page = await getPage(space.id, pageSlug);
      if (!page) return pageNotFound(pageSlug, space.name);

      const doc = readPageDoc(page.blocks);
      return {
        content: [
          {
            type: "text" as const,
            text: doc.content.length ? JSON.stringify(doc) : `${page.title} is empty.`,
          },
        ],
        structuredContent: {
          space: { name: space.name, slug: space.slug },
          page: { id: page.id, title: page.title, slug: page.slug },
          doc,
        },
      };
    },
  );
}

const setPageBodyOutput = z.object({
  space: spaceRef,
  page: pageRef,
  blocks: z.number().int(),
  replaced: z.boolean(),
});

function registerSetPageBlocks(server: McpServer) {
  server.registerTool(
    "set_page_blocks",
    {
      title: "Set page blocks",
      description:
        "Replace a page's entire body, by space and page slug. This replaces " +
        "rather than merges, so read the page with get_page first and send back " +
        "the full body as doc. A body with anything the editor cannot keep — an " +
        "unknown block type, a prop of the wrong type, markup outside the " +
        "allowlist — is refused whole, with the reasons, and nothing is saved. " +
        "html is still accepted for a body written the old way: it is converted " +
        "to blocks and checked the same way. " +
        BLOCK_GUIDE,
      inputSchema: pageInput.extend(bodyInput),
      outputSchema: setPageBodyOutput,
      // Replaces content rather than adding to it, so it is destructive even
      // though sending the same document twice leaves the same document.
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ space: slug, page: pageSlug, doc, html }) => {
      if ((doc === undefined) === (html === undefined)) {
        return toolError("Send the body as doc or as html — exactly one of them.");
      }

      const space = await getSpace(slug);
      if (!space) return spaceNotFound(slug);

      const page = await getPage(space.id, pageSlug);
      if (!page) return pageNotFound(pageSlug, space.name);

      const body = doc ?? fromLegacyHtml(html ?? "");
      const result = await setPageDoc(page.id, body);
      if (!result.saved) return bodyRefused(result.problems);

      const blocks = countBlocks(checkPageDoc(body).doc.content);
      return {
        content: [
          { type: "text" as const, text: `Saved ${page.title} in ${space.name} (${blocks} blocks).` },
        ],
        structuredContent: {
          space: { name: space.name, slug: space.slug },
          page: { id: page.id, title: page.title, slug: page.slug },
          blocks,
          replaced: true,
        },
      };
    },
  );
}

const pagePath = (space: string, page: string) => `/dashboard/${space}/pages/${page}`;

const createPageOutput = z.object({
  space: spaceRef,
  page: pageRef,
  blocks: z.number().int(),
  dashboardPath: z.string(),
});

function registerCreatePage(server: McpServer) {
  server.registerTool(
    "create_page",
    {
      title: "Create page",
      description:
        "Add a page to a space. The slug is derived from the title and gets a " +
        "numeric suffix if the space already has it, so use the slug this " +
        "returns rather than guessing it. The body is optional — without one " +
        "the page starts empty — and follows the same rules as set_page_blocks: " +
        "a body the editor cannot keep is refused whole, with the reasons, and " +
        "no page is created. " +
        BLOCK_GUIDE,
      inputSchema: spaceInput.extend({
        title: z.string().trim().min(1).max(LIMITS.pageTitle).describe("The page's title."),
        ...bodyInput,
      }),
      outputSchema: createPageOutput,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ space: slug, title, doc, html }) => {
      if (doc !== undefined && html !== undefined) {
        return toolError("Send the body as doc or as html, not both — or neither for an empty page.");
      }

      const space = await getSpace(slug);
      if (!space) return spaceNotFound(slug);

      const body = doc ?? (html === undefined ? undefined : fromLegacyHtml(html));
      const result = await createPage(space.id, title, body);
      if (!result) return toolError(`Could not find a free slug for "${title}" in ${space.name}. Try a different title.`);
      if (!result.saved) return bodyRefused(result.problems);

      const blocks = body === undefined ? 0 : countBlocks(checkPageDoc(body).doc.content);
      return {
        content: [
          {
            type: "text" as const,
            text: `Created ${title} (${result.slug}) in ${space.name}` + (blocks ? ` with ${blocks} blocks.` : ", empty."),
          },
        ],
        structuredContent: {
          space: { name: space.name, slug: space.slug },
          page: { id: result.id, title, slug: result.slug },
          blocks,
          dashboardPath: pagePath(space.slug, result.slug),
        },
      };
    },
  );
}

const renamePageOutput = z.object({
  space: spaceRef,
  page: pageRef,
  previousTitle: z.string(),
});

function registerRenamePage(server: McpServer) {
  server.registerTool(
    "rename_page",
    {
      title: "Rename page",
      description:
        "Change a page's title, by space and page slug. The slug stays as it " +
        "is, so links to the page keep working; the body is untouched.",
      inputSchema: pageInput.extend({
        title: z.string().trim().min(1).max(LIMITS.pageTitle).describe("The page's new title."),
      }),
      outputSchema: renamePageOutput,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ space: slug, page: pageSlug, title }) => {
      const space = await getSpace(slug);
      if (!space) return spaceNotFound(slug);

      const page = await getPage(space.id, pageSlug);
      if (!page || !(await renamePage(page.id, title))) return pageNotFound(pageSlug, space.name);

      return {
        content: [{ type: "text" as const, text: `Renamed ${page.title} to ${title} in ${space.name}.` }],
        structuredContent: {
          space: { name: space.name, slug: space.slug },
          page: { id: page.id, title, slug: page.slug },
          previousTitle: page.title,
        },
      };
    },
  );
}

const deletePageOutput = z.object({ space: spaceRef, page: pageRef });

function registerDeletePage(server: McpServer) {
  server.registerTool(
    "delete_page",
    {
      title: "Delete page",
      description:
        "Delete a page and its whole body, by space and page slug. This cannot " +
        "be undone. Nothing else is removed: components the page used stay in " +
        "the space.",
      inputSchema: pageInput,
      outputSchema: deletePageOutput,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ space: slug, page: pageSlug }) => {
      const space = await getSpace(slug);
      if (!space) return spaceNotFound(slug);

      const page = await getPage(space.id, pageSlug);
      if (!page || !(await deletePage(space.id, page.id))) return pageNotFound(pageSlug, space.name);

      return {
        content: [{ type: "text" as const, text: `Deleted ${page.title} (${page.slug}) from ${space.name}.` }],
        structuredContent: {
          space: { name: space.name, slug: space.slug },
          page: { id: page.id, title: page.title, slug: page.slug },
        },
      };
    },
  );
}

const renameSpaceOutput = z.object({
  name: z.string(),
  slug: z.string(),
  previousName: z.string(),
});

function registerRenameSpace(server: McpServer) {
  server.registerTool(
    "rename_space",
    {
      title: "Rename space",
      description:
        "Change a space's display name. The slug stays as it is, so every tool " +
        "call and dashboard link that uses it keeps working.",
      inputSchema: spaceInput.extend({
        name: z.string().trim().min(1).max(LIMITS.spaceName).describe("The space's new name."),
      }),
      outputSchema: renameSpaceOutput,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ space: slug, name }) => {
      const space = await getSpace(slug);
      if (!space || !(await renameSpace(space.id, name))) return spaceNotFound(slug);

      return {
        content: [{ type: "text" as const, text: `Renamed ${space.name} to ${name}; the slug is still ${space.slug}.` }],
        structuredContent: { name, slug: space.slug, previousName: space.name },
      };
    },
  );
}

const deleteSpaceOutput = z.object({
  name: z.string(),
  slug: z.string(),
  deletedPages: z.number().int(),
  deletedComponents: z.number().int(),
  spacesLeftWithoutDesignSystem: z.number().int(),
});

function registerDeleteSpace(server: McpServer) {
  server.registerTool(
    "delete_space",
    {
      title: "Delete space",
      description:
        "Delete a space and everything in it: every page and its body, every " +
        "component, and the design system the space owns. This cannot be " +
        "undone. Other spaces that use this space's design system are left with " +
        "none, and components other spaces imported from it keep their copies " +
        "but lose the link. Call get_space first to see what it holds.",
      inputSchema: spaceInput,
      outputSchema: deleteSpaceOutput,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ space: slug }) => {
      const space = await getSpace(slug);
      if (!space || !(await deleteSpace(space.id))) return spaceNotFound(slug);

      const borrowers = space.design_system_borrowers;
      return {
        content: [
          {
            type: "text" as const,
            text:
              `Deleted ${space.name} (${space.slug}) with its ${space.page_count} pages and ` +
              `${space.component_count} components.` +
              (borrowers ? ` ${borrowers} other space(s) used its design system and now have none.` : ""),
          },
        ],
        structuredContent: {
          name: space.name,
          slug: space.slug,
          deletedPages: space.page_count,
          deletedComponents: space.component_count,
          spacesLeftWithoutDesignSystem: borrowers,
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
  registerCreatePage(server);
  registerSetPageBlocks(server);
  registerRenamePage(server);
  registerDeletePage(server);
  registerListComponents(server);
  registerGetDesignSystem(server);
  registerListDesignSystems(server);
  registerUseDesignSystem(server);
  registerGetSpace(server);
  registerCreateSpace(server);
  registerRenameSpace(server);
  registerDeleteSpace(server);
  registerCreateComponent(server);
  registerUpdateComponent(server);
  registerDeleteComponent(server);
  registerListImportable(server);
  registerImportComponent(server);
  registerListRecentActivity(server);
  return server;
}
