import { notFound, redirect } from "next/navigation";
import { getSpace, listComponents, listDesignSystems, listPages } from "@/db";
import {
  componentProblems,
  parseProps,
  renderComponent,
  type Prop,
} from "@/db/component-template";
import { useDesignSystem } from "../actions";
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
/** Renders DESIGN.md prose: bullets and paragraphs, with bold/code inline. */
function Prose({ lines }: { lines: string[] }) {
  const inline = (text: string) =>
    text
      .split(/(\*\*[^*]+\*\*|`[^`]+`)/)
      .filter(Boolean)
      .map((part, index) =>
        part.startsWith("**") ? (
          <strong key={index} className="font-semibold text-ink">
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

/* -------------------------------------------------------------- design system */

/** A labelled block of the system, with its count — the rail's repeating unit. */
function Spec({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-5 border-t border-line pt-4 first:mt-0 first:border-t-0 first:pt-0">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="label font-semibold">{label}</h3>
        <span className="text-[11px] text-smoke">{count}</span>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Each step drawn at its own size, so the ramp can be read rather than decoded. */
function TypeStep({ step }: { step: (typeof design.typography)[number] }) {
  // Scaled relative to the largest step rather than clamped to a ceiling:
  // `display` is 3.5rem in the product, which would burst the rail, but
  // clamping it would also flatten it into `h1` and misrepresent the ramp.
  const largest = Math.max(...design.typography.map((s) => parseFloat(s.size) || 1));
  const size = 1 + ((parseFloat(step.size) || 1) / largest) * 1.25;

  return (
    <li className="flex items-center gap-4 border-b border-line py-2.5 last:border-0">
      <span
        aria-hidden
        className="w-14 shrink-0 font-semibold leading-none"
        style={{ fontSize: `${size}rem` }}
      >
        Ag
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{step.name}</span>
        <span className="block truncate text-xs text-smoke">
          {step.font} · {step.size} · {step.weight}
        </span>
      </span>
    </li>
  );
}

/**
 * The rules every component is built to. Components and tokens are authored
 * through the MCP server; the choice of system is not, so it is made here.
 */
async function DesignSystemSection({
  spaceId,
  designSystemId,
  className = "",
}: {
  spaceId: string;
  designSystemId: string | null;
  className?: string;
}) {
  const systems = await listDesignSystems();
  const current = systems.find((system) => system.id === designSystemId);

  return (
    <aside className={`min-w-0 lg:sticky lg:top-10 ${className}`}>
      <div className="card p-5">
        <Spec label="Colors" count={design.colors.length}>
          <ul className="grid grid-cols-3 gap-x-2 gap-y-3">
            {design.colors.map((color) => (
              <li key={color.name} className="min-w-0">
                <span
                  aria-hidden
                  className="block h-9 w-full rounded-lg border border-line"
                  style={{ background: color.value }}
                />
                <span className="mt-1.5 block truncate text-xs font-medium">{color.name}</span>
                <span className="block truncate text-[11px] text-smoke">{color.value}</span>
              </li>
            ))}
          </ul>
        </Spec>

        <Spec label="Typography" count={design.typography.length}>
          <ul>
            {design.typography.map((step) => (
              <TypeStep key={step.name} step={step} />
            ))}
          </ul>
        </Spec>

        <Spec label="Radii" count={design.rounded.length}>
          <ul className="grid grid-cols-3 gap-x-2 gap-y-3">
            {design.rounded.map((shape) => (
              <li key={shape.name} className="min-w-0">
                <span
                  aria-hidden
                  className="block h-9 w-full border border-line bg-white"
                  style={{ borderRadius: shape.value }}
                />
                <span className="mt-1.5 block truncate text-xs font-medium">{shape.name}</span>
                <span className="block text-[11px] text-smoke">{shape.value}</span>
              </li>
            ))}
          </ul>
        </Spec>

        <details className="mt-5 border-t border-line pt-4">
          <summary className="label cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            Read the full guidelines
            <span className="ml-2 text-[11px] text-smoke">{design.guidelines.length}</span>
          </summary>
          <div className="mt-4 space-y-5">
            {design.guidelines.map((section) => (
              <section key={section.title}>
                <h4 className="text-base font-semibold tracking-tight">
                  {section.title}
                </h4>
                <div className="mt-2">
                  <Prose lines={section.lines} />
                </div>
              </section>
            ))}
          </div>
        </details>

        {/* The MCP has no setter for this, so the choice is made here — a plain
            form rather than the old popover, since it is not the rail's point.
            Hidden when the space already points at the only system there is:
            the one available action would be to reselect it. */}
        {(!current || systems.length > 1) && (
          <form action={useDesignSystem} className="mt-5 border-t border-line pt-4">
            <input type="hidden" name="spaceId" value={spaceId} />
            <label className="label block" htmlFor="design-system">
              Which system this space points at
            </label>
            <select
              id="design-system"
              name="designSystemId"
              required
              defaultValue={current?.id ?? ""}
              className="input mt-2"
            >
              {!current && (
                <option value="" disabled>
                  Choose a system
                </option>
              )}
              {systems.map((system) => (
                <option key={system.id} value={system.id}>
                  {system.name}
                  {system.space_id === spaceId ? " (this space)" : ""}
                </option>
              ))}
            </select>
            <button type="submit" className="btn-quiet mt-2 rounded-md border border-line">
              Use selected system
            </button>
            {/* TODO(#48): retire this picker once one global system is
                decided; nothing above reads the selected row. */}
            <p className="mt-2 text-xs leading-relaxed text-smoke">
              The colours, type and guidelines above come from DESIGN.md either way.
            </p>
          </form>
        )}
      </div>
    </aside>
  );
}

/* ---------------------------------------------------------------- components */

type ComponentRow = Awaited<ReturnType<typeof listComponents>>[number];

/** A component shows itself: its own template, drawn over a faint dot grid. */
function ComponentCard({ component }: { component: ComponentRow }) {
  return (
    <li className="flex flex-col overflow-hidden rounded-xl border border-line bg-card transition-shadow hover:shadow-[0_8px_24px_#1111110d]">
      <div
        className="flex min-h-44 items-center justify-center border-b border-line p-6"
        style={{
          backgroundColor: "#ffffff",
          backgroundImage: "radial-gradient(#1111110f 1px, transparent 1px)",
          backgroundSize: "14px 14px",
        }}
      >
        <ComponentPreview props={parseProps(component.props)} template={component.template} />
      </div>

      <div className="flex flex-1 flex-col gap-2 p-5">
        <h3 className="truncate text-base font-semibold tracking-tight">
          {component.name}
        </h3>

        {component.description && (
          <p className="text-sm leading-relaxed text-smoke">{component.description}</p>
        )}

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
  );
}

function ComponentsSection({ components }: { components: ComponentRow[] }) {
  if (components.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line px-6 py-14 text-center text-sm text-smoke">
        No components in this space yet.
      </p>
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {components.map((component) => (
        <ComponentCard key={component.id} component={component} />
      ))}
    </ul>
  );
}

/* --------------------------------------------------------------------- view */

/**
 * Components on the left, the system they are built to in a rail on the right.
 *
 * One grid, four placed items, rather than a headers row and a content row: two
 * rows would collapse to heading, heading, content, content below `lg`, so the
 * second heading would arrive detached from what it names. Placed explicitly,
 * the DOM order stays heading, content, heading, content for narrow screens
 * while `lg` pulls the two headings into one row and the two bodies into the
 * next — so both columns start on the same line without either being nudged.
 */
async function DesignView({
  spaceId,
  designSystemId,
}: {
  spaceId: string;
  designSystemId: string | null;
}) {
  const components = await listComponents(spaceId);

  return (
    <div className="grid items-start gap-x-10 gap-y-4 lg:grid-cols-[minmax(0,1fr)_21rem]">
      <div id="components" className="min-w-0 scroll-mt-6 lg:col-start-1 lg:row-start-1">
        <h2 className="flex items-baseline gap-2 text-lg font-semibold tracking-tight">
          Components
          <span className="text-xs font-normal text-smoke">{components.length}</span>
        </h2>
        <p className="mt-1 text-xs text-smoke">Add and change them with the MCP server.</p>
      </div>

      <div className="min-w-0 lg:col-start-1 lg:row-start-2">
        <ComponentsSection components={components} />
      </div>

      <div className="min-w-0 lg:col-start-2 lg:row-start-1">
        <h2 className="text-lg font-semibold tracking-tight">Design System</h2>
        <p className="mt-1 text-xs text-smoke">
          From <code className="rounded bg-[#1111110a] px-1 py-0.5">DESIGN.md</code> — the rules
          every component here is built to.
        </p>
      </div>

      <DesignSystemSection
        spaceId={spaceId}
        designSystemId={designSystemId}
        className="lg:col-start-2 lg:row-start-2"
      />
    </div>
  );
}
