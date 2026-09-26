import { notFound, redirect } from "next/navigation";
import {
  getSpace,
  listComponents,
  listDesignSystems,
  listImportable,
  listPages,
} from "@/db";
import {
  componentProblems,
  parseProps,
  renderComponent,
  type Prop,
} from "@/db/component-template";
import {
  createComponent,
  deleteComponent,
  importComponent,
  updateComponent,
  useDesignSystem,
} from "../actions";
// Generated from DESIGN.md by `scripts/sync-design.mjs` (see `npm run design:sync`).
import design from "./design.generated.json";
import { SpaceLayout, type View } from "./space-layout";

/**
 * `?tab=` is the old three-tab scheme. Its links still work, but they are
 * redirected to the canonical URL so a Components link lands on Components
 * rather than at the top of a page whose first section is the design system.
 */
const legacyTarget = (slug: string, tab: string | string[] | undefined) => {
  const raw = Array.isArray(tab) ? tab[0] : tab;
  if (raw === "components") return `/dashboard/${slug}?view=design#components`;
  if (raw === "design") return `/dashboard/${slug}?view=design`;
  return raw ? `/dashboard/${slug}` : null;
};

/** Shared by the Design view's popovers. */
const POPOVER =
  "absolute right-0 z-10 rounded-xl border border-line bg-white shadow-[0_6px_12px_#11111114]";
const SUMMARY = "cursor-pointer list-none [&::-webkit-details-marker]:hidden";

export default async function SpacePage(props: PageProps<"/dashboard/[space]">) {
  const { space: slug } = await props.params;
  const query = await props.searchParams;

  const legacy = legacyTarget(slug, query.tab);
  if (legacy) redirect(legacy);

  const view: View = query.view === "design" ? "design" : "pages";

  const space = await getSpace(slug);
  if (!space) notFound();

  // The layout shell is a client component, so the page hands it the data
  // rather than server-rendered markup it cannot rearrange.
  return (
    <SpaceLayout
      space={space}
      pages={view === "pages" ? await listPages(space.id) : []}
      view={view}
      design={
        view === "design" ? (
          <DesignView spaceId={space.id} designSystemId={space.design_system_id} />
        ) : null
      }
    />
  );
}
/*
 * A component renders itself: the template it declares, filled with its own
 * fallbacks. Nothing here guesses from the name, which is the whole point — a
 * component with no template yet has nothing to show, and says so.
 */
function ComponentPreview({ props, template }: { props: Prop[]; template: string }) {
  const problems = componentProblems(props, template);
  const html = renderComponent(props, template);

  if (!html) {
    return (
      <p className="max-w-55 text-center text-xs leading-relaxed text-smoke">
        {problems.length
          ? problems[0]
          : template
            ? "This template declares no props, so it has nothing to draw."
            : "No template yet. Declare its props and template below to see it here."}
      </p>
    );
  }

  // Safe by construction: renderComponent returns nothing unless the template
  // passed the page allowlist, and it escapes every value it substitutes.
  // `doc comp-preview` because this is the same markup a page canvas renders:
  // the type rules come from `.doc`, the page's own layout from `.comp-preview`.
  return (
    <div
      className="doc comp-preview w-full max-w-55"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/**
 * One prop per line, `key | Label | fallback`. Terse, but it is the shape an
 * agent writes and a person can read back, and it needs no repeatable-row UI.
 */
function propsToText(props: Prop[]) {
  return props.map((prop) => `${prop.key} | ${prop.label} | ${prop.fallback}`).join("\n");
}

/**
 * Corrects what a component declares, in place. Folded away because a component
 * is written once and read often, and the preview above it is the point.
 */
function ComponentEditor({
  spaceId,
  id,
  props,
  template,
}: {
  spaceId: string;
  id: string;
  props: Prop[];
  template: string;
}) {
  const problems = componentProblems(props, template);

  return (
    <details className="border-t border-line pt-2">
      <summary className={`label px-1 py-1 ${SUMMARY}`}>
        {props.length ? `${props.length} props` : "No props declared"}
        {problems.length ? " · cannot render" : ""}
      </summary>

      {problems.length > 0 && (
        <ul className="mt-2 space-y-1 rounded-lg border border-line bg-butter px-3 py-2">
          {problems.map((problem) => (
            <li key={problem} className="text-xs leading-relaxed">
              {problem}
            </li>
          ))}
        </ul>
      )}

      <form action={updateComponent} className="mt-2 grid gap-2">
        <input type="hidden" name="spaceId" value={spaceId} />
        <input type="hidden" name="id" value={id} />
        <textarea
          name="props"
          rows={3}
          defaultValue={propsToText(props)}
          aria-label="Declared props"
          className="input font-mono text-xs"
        />
        <textarea
          name="template"
          rows={3}
          defaultValue={template}
          placeholder={"<h2>{{heading}}</h2>"}
          aria-label="Component template"
          className="input font-mono text-xs"
        />
        <button type="submit" className="btn-quiet justify-center rounded-md">
          Save props and template
        </button>
      </form>
    </details>
  );
}

/** Renders DESIGN.md prose: bullets and paragraphs, with bold/code inline. */
function Prose({ lines }: { lines: string[] }) {
  const inline = (text: string) =>
    text
      .split(/(\*\*[^*]+\*\*|`[^`]+`)/)
      .filter(Boolean)
      .map((part, index) =>
        part.startsWith("**") ? (
          <strong key={index} className="font-medium text-ink">
            {part.slice(2, -2)}
          </strong>
        ) : part.startsWith("`") ? (
          <code key={index} className="rounded bg-[#1111110a] px-1 py-0.5 text-xs">
            {part.slice(1, -1)}
          </code>
        ) : (
          part
        ),
      );

  const blocks: React.ReactNode[] = [];
  let paragraph: string[] = [];
  let bullets: string[] = [];

  const flush = () => {
    if (paragraph.length) {
      blocks.push(
        <p key={blocks.length} className="text-sm leading-relaxed text-smoke">
          {inline(paragraph.join(" "))}
        </p>,
      );
      paragraph = [];
    }
    if (bullets.length) {
      blocks.push(
        <ul key={blocks.length} className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-smoke">
          {bullets.map((bullet, index) => (
            <li key={index}>{inline(bullet)}</li>
          ))}
        </ul>,
      );
      bullets = [];
    }
  };

  for (const line of lines) {
    if (!line.trim()) flush();
    else if (line.startsWith("- ")) {
      if (paragraph.length) flush();
      bullets.push(line.slice(2));
    } else if (bullets.length) {
      // Wrapped bullet continuation, e.g. "  padding, flex with 0.5rem gap."
      bullets[bullets.length - 1] += ` ${line.trim()}`;
    } else paragraph.push(line.trim());
  }
  flush();

  return <div className="space-y-3">{blocks}</div>;
}

/** DESIGN.md is the design system; this is the space's chosen name for it. */
async function DesignSystemSection({
  spaceId,
  designSystemId,
}: {
  spaceId: string;
  designSystemId: string | null;
}) {
  const systems = await listDesignSystems();
  const current = systems.find((system) => system.id === designSystemId);

  return (
    <div>
      <h2 className="font-primary text-2xl font-normal tracking-[-0.01em]">Design System</h2>
      <p className="mt-1 text-sm text-smoke">
        The rules components and AI-generated UI follow, from{" "}
        <code className="rounded bg-[#1111110a] px-1 py-0.5 text-xs">DESIGN.md</code>.
      </p>

      <div className="card mt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          {/* The card describes DESIGN.md, because that is what is rendered
              below it. The space's own selection lives in the picker instead
              of in this heading, where it used to contradict the contents. */}
          <div>
            <h3 className="font-primary text-lg font-medium tracking-tight">DESIGN.md</h3>
            <p className="mt-1 text-xs text-smoke">
              {design.colors.length} colours · {design.typography.length} type steps ·{" "}
              {design.rounded.length} radii · the same rules for every space
            </p>
          </div>

          {/* Swapping systems is rare, so it stays folded away. */}
          {(!current || systems.length > 1) && (
            <details className="relative shrink-0">
              <summary className={`btn-quiet rounded-md ${SUMMARY}`}>Change</summary>
              <form action={useDesignSystem} className={`${POPOVER} mt-2 w-72 max-w-[80vw] p-3`}>
                <input type="hidden" name="spaceId" value={spaceId} />
                <fieldset className="grid gap-1">
                  <legend className="label mb-1 px-1">Which system this space points at</legend>
                  {systems.map((system) => (
                    <label
                      key={system.id}
                      className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1.5 py-2 hover:bg-[#1111110a]"
                    >
                      <input
                        type="radio"
                        name="designSystemId"
                        value={system.id}
                        required
                        defaultChecked={system.id === designSystemId}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{system.name}</span>
                        <span className="block truncate text-xs text-smoke">
                          {system.space_id === spaceId
                            ? "This space"
                            : `From ${system.space_name ?? "unassigned"}`}
                          {" · "}
                          {system.token_count} tokens
                        </span>
                      </span>
                    </label>
                  ))}
                </fieldset>
                <button type="submit" className="btn mt-2 w-full justify-center">
                  Use selected system
                </button>
                {/* TODO(#48): retire this picker once one global system is
                    decided; nothing below reads the selected row. */}
                <p className="mt-2 px-1 text-xs leading-relaxed text-smoke">
                  The colours, type and guidelines above come from DESIGN.md
                  either way.
                </p>
              </form>
            </details>
          )}
        </div>

        <p className="label mt-5">Colors</p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {design.colors.map((color) => (
            <li
              key={color.name}
              className="flex items-center gap-2 rounded-lg border border-line bg-white py-1.5 pr-2.5 pl-1.5"
            >
              <span
                aria-hidden
                className="size-4 rounded-sm border border-line"
                style={{ background: color.value }}
              />
              <span className="text-xs font-medium">{color.name}</span>
              <span className="text-xs text-smoke">{color.value}</span>
            </li>
          ))}
        </ul>

        <p className="label mt-5">Typography</p>
        <ul className="mt-1 divide-y divide-line">
          {design.typography.map((step) => (
            <li key={step.name} className="flex items-baseline justify-between gap-3 py-2">
              <span className="text-sm font-medium">{step.name}</span>
              <span className="text-right text-xs text-smoke">
                {step.font} · {step.size} · {step.weight}
              </span>
            </li>
          ))}
        </ul>

        <p className="label mt-5">Radii</p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {design.rounded.map((shape) => (
            <li key={shape.name} className="flex items-center gap-2 rounded-lg border border-line bg-white px-2.5 py-1.5">
              <span className="text-xs font-medium">{shape.name}</span>
              <span className="text-xs text-smoke">{shape.value}</span>
            </li>
          ))}
        </ul>
      </div>

      <details className="mt-3">
        <summary className={`label px-1 py-1 ${SUMMARY}`}>Read the full guidelines</summary>
        <div className="mt-3 space-y-5">
          {design.guidelines.map((section) => (
            <section key={section.title}>
              <h4 className="font-primary text-base font-medium tracking-tight">
                {section.title}
              </h4>
              <div className="mt-2">
                <Prose lines={section.lines} />
              </div>
            </section>
          ))}
        </div>
      </details>
    </div>
  );
}

async function ComponentsSection({ spaceId }: { spaceId: string }) {
  const [components, importable] = await Promise.all([
    listComponents(spaceId),
    listImportable(spaceId),
  ]);

  return (
    <div id="components" className="scroll-mt-6">
      <h2 className="font-primary text-2xl font-normal tracking-[-0.01em]">Components</h2>
      <p className="mt-1 text-sm text-smoke">
        Reusable UI built to the design system above.
      </p>

      <form action={createComponent} className="mt-4 grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="spaceId" value={spaceId} />
        <input
          name="name"
          required
          maxLength={80}
          placeholder="Component name"
          aria-label="Component name"
          className="input"
        />
        <input
          name="description"
          maxLength={300}
          placeholder="What it does (optional)"
          aria-label="Component description"
          className="input"
        />
        {/* One prop per line, `key | Label | default`, which is the shape an
            agent can write and a person can read back. */}
        <textarea
          name="props"
          rows={3}
          placeholder={"Props, one per line — heading | Heading | Build faster"}
          aria-label="Declared props"
          className="input font-mono text-xs"
        />
        <textarea
          name="template"
          rows={3}
          placeholder={"Template — <h2>{{heading}}</h2><p>{{body}}</p>"}
          aria-label="Component template"
          className="input font-mono text-xs"
        />
        <button type="submit" className="btn justify-center sm:col-span-2">
          Create component
        </button>
      </form>

      {components.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-smoke">
          No components in this space yet.
        </p>
      ) : (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {components.map((component) => (
            <li
              key={component.id}
              className="flex flex-col overflow-hidden rounded-xl border border-line bg-card"
            >
              {/* Preview first — the component's own template, not a mock. */}
              <div className="flex min-h-36 items-center justify-center border-b border-line bg-paper p-4">
                <ComponentPreview
                  props={parseProps(component.props)}
                  template={component.template}
                />
              </div>
              <div className="flex flex-1 flex-col gap-2 p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-primary text-base font-medium tracking-tight">
                    {component.name}
                  </h3>
                  <form action={deleteComponent}>
                    <input type="hidden" name="id" value={component.id} />
                    <input type="hidden" name="spaceId" value={spaceId} />
                    <button type="submit" className="btn-quiet">
                      Delete
                    </button>
                  </form>
                </div>
                {component.description && (
                  <p className="text-sm leading-relaxed text-smoke">{component.description}</p>
                )}

                {/* What the component declares, in the same line-per-prop shape
                    the create form takes, so it can be corrected in place. */}
                <ComponentEditor
                  spaceId={spaceId}
                  id={component.id}
                  props={parseProps(component.props)}
                  template={component.template}
                />

                <p className="mt-auto pt-1">
                  {component.origin_space_name ? (
                    <span className="badge">
                      Imported · {component.origin_name} from {component.origin_space_name}
                    </span>
                  ) : (
                    <span className="badge badge-quiet">Local</span>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <details className="mt-6 border-t border-line pt-4">
        <summary className={`label px-1 py-1 ${SUMMARY}`}>Import from another space</summary>
        {importable.length === 0 ? (
          <p className="mt-3 text-sm text-smoke">
            Nothing left to import from other spaces.
          </p>
        ) : (
          <form action={importComponent} className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input type="hidden" name="spaceId" value={spaceId} />
            <select
              name="componentId"
              required
              aria-label="Component to import"
              className="input sm:max-w-xs"
              defaultValue=""
            >
              <option value="" disabled>
                Choose a component
              </option>
              {importable.map((component) => (
                <option key={component.id} value={component.id}>
                  {component.space_name} · {component.name}
                </option>
              ))}
            </select>
            <button type="submit" className="btn shrink-0 justify-center">
              Import component
            </button>
          </form>
        )}
      </details>
    </div>
  );
}

async function DesignView({
  spaceId,
  designSystemId,
}: {
  spaceId: string;
  designSystemId: string | null;
}) {
  return (
    <div className="flex flex-col gap-10 border-t border-line pt-6">
      <DesignSystemSection spaceId={spaceId} designSystemId={designSystemId} />
      <ComponentsSection spaceId={spaceId} />
    </div>
  );
}
