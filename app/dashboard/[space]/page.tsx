import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getSpace,
  listComponents,
  listDesignSystems,
  listImportable,
  listPages,
} from "@/db";
import { ago } from "../ago";
import {
  createComponent,
  createPage,
  deleteComponent,
  deletePage,
  importComponent,
  useDesignSystem,
} from "../actions";
// Generated from DESIGN.md by `scripts/sync-design.mjs` (see `npm run design:sync`).
import design from "./design.generated.json";

/**
 * Two levels, not three equal tabs: Pages are the content this space is for,
 * Design is the visual system behind it. `?tab=` is the old three-tab scheme,
 * still honoured so existing links keep working.
 */
const VIEWS = ["pages", "design"] as const;
type View = (typeof VIEWS)[number];

const LABEL: Record<View, string> = { pages: "Pages", design: "Design" };

const viewOf = (value: string | string[] | undefined): View => {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "components" || raw === "design") return "design";
  return "pages";
};

/** Shared by the New Page popover and the row menus. */
const POPOVER =
  "absolute right-0 z-10 rounded-xl border border-line bg-white shadow-[0_6px_12px_#11111114]";
const SUMMARY = "cursor-pointer list-none [&::-webkit-details-marker]:hidden";

export default async function SpacePage(props: PageProps<"/dashboard/[space]">) {
  const { space: slug } = await props.params;
  const query = await props.searchParams;
  const view = viewOf(query.view ?? query.tab);

  const space = await getSpace(slug);
  if (!space) notFound();

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-primary text-4xl font-normal tracking-[-0.02em]">{space.name}</h1>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-smoke">
            Pages are where this space writes and publishes. Components and the design
            system live in Design.
          </p>
        </div>

        <nav
          aria-label="Space sections"
          className="flex shrink-0 gap-1 rounded-lg border border-line bg-card p-1"
        >
          {VIEWS.map((item) => (
            <Link
              key={item}
              href={item === "pages" ? `/dashboard/${space.slug}` : `/dashboard/${space.slug}?view=design`}
              aria-current={view === item ? "page" : undefined}
              data-active={view === item}
              className="tab"
            >
              {LABEL[item]}
            </Link>
          ))}
        </nav>
      </header>

      {/* The design context stays one click away while writing pages. */}
      {view === "pages" && (
        <Link
          href={`/dashboard/${space.slug}?view=design`}
          className="group flex items-center gap-3 rounded-xl border border-line bg-card px-4 py-3 transition-colors hover:border-ink/20"
        >
          <span aria-hidden className="size-2 shrink-0 rounded-full bg-mint" />
          <span className="min-w-0 flex-1 truncate text-sm">
            <span className="font-medium">
              {space.design_system_name ?? "No design system"}
            </span>
            <span className="text-smoke">
              {" · "}
              {space.component_count}{" "}
              {space.component_count === 1 ? "component" : "components"}
            </span>
          </span>
          <span aria-hidden className="shrink-0 text-xs text-smoke group-hover:text-ink">
            Design →
          </span>
        </Link>
      )}

      {view === "pages" ? (
        <PagesView space={space} />
      ) : (
        <DesignView spaceId={space.id} designSystemId={space.design_system_id} />
      )}
    </main>
  );
}

type SpaceSummary = {
  id: string;
  slug: string;
  component_count: number;
  design_system_name: string | null;
};

async function PagesView({ space }: { space: SpaceSummary }) {
  const pages = await listPages(space.id);

  return (
    <section>
      <div className="flex items-start justify-between gap-4 border-t border-line pt-6">
        <div>
          <h2 className="font-primary text-2xl font-normal tracking-[-0.01em]">Pages</h2>
          <p className="mt-1 text-sm text-smoke">
            {pages.length} {pages.length === 1 ? "page" : "pages"}
          </p>
        </div>

        {/* Native <details> popover, so the trigger needs no client component. */}
        <details className="relative">
          <summary className={`btn ${SUMMARY}`}>
            <PlusIcon className="size-4" />
            New Page
          </summary>
          {/* w-72 with a small-screen cap so the panel never leaves the viewport. */}
          <form
            action={createPage}
            className={`${POPOVER} mt-2 flex w-72 max-w-[80vw] flex-col gap-3 p-4`}
          >
            <input type="hidden" name="spaceId" value={space.id} />
            <label className="label" htmlFor="new-page-title">
              Page title
            </label>
            <input
              id="new-page-title"
              name="title"
              required
              maxLength={120}
              placeholder="e.g. Now"
              className="input"
            />
            <button type="submit" className="btn justify-center">
              Create page
            </button>
          </form>
        </details>
      </div>

      {pages.length === 0 ? (
        <p className="mt-5 rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-smoke">
          No pages yet. Add the first one to start writing.
        </p>
      ) : (
        <ul className="mt-5 divide-y divide-line border-t border-line">
          {pages.map((page) => (
            <li key={page.id} className="flex items-center gap-3 py-3.5">
              <FileIcon className="size-4 shrink-0 text-smoke" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{page.title}</span>
              <span className="shrink-0 text-xs text-smoke">
                Created {ago(page.created_at)}
              </span>
              <details className="relative shrink-0">
                <summary
                  aria-label={`Actions for ${page.title}`}
                  className={`flex size-8 items-center justify-center rounded-md text-smoke transition-colors hover:bg-[#1111110d] hover:text-ink ${SUMMARY}`}
                >
                  <DotsIcon className="size-4" />
                </summary>
                <form action={deletePage} className={`${POPOVER} mt-1 p-1`}>
                  <input type="hidden" name="id" value={page.id} />
                  <input type="hidden" name="spaceId" value={space.id} />
                  <button type="submit" className="btn-quiet flex w-full justify-start rounded-md">
                    Delete page
                  </button>
                </form>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* Visual preview per component, inferred from its name — no stored code yet,
   so the name is the only signal. Static mock, never interactive. */
function previewKind(name: string) {
  const n = name.toLowerCase();
  if (/(button|cta|action)/.test(n)) return "button";
  if (/(input|field|form|search|textarea)/.test(n)) return "input";
  if (/(badge|pill|tag|chip|status)/.test(n)) return "badge";
  if (/(nav|header|hero|banner|footer|menu)/.test(n)) return "hero";
  if (/(card|panel|tile|feature|pricing|testimonial)/.test(n)) return "card";
  return "generic";
}

function ComponentPreview({ name, description }: { name: string; description: string }) {
  const kind = previewKind(name);
  const label = name.length > 18 ? `${name.slice(0, 17).trimEnd()}…` : name;
  const sub = description.length > 40 ? `${description.slice(0, 39).trimEnd()}…` : description;

  switch (kind) {
    case "button":
      return (
        <span className="btn pointer-events-none select-none" aria-hidden>
          {label || "Button"}
        </span>
      );
    case "input":
      return (
        <span className="pointer-events-none block w-full max-w-55 select-none" aria-hidden>
          <span className="input block truncate text-left text-smoke">
            {sub || "Placeholder…"}
          </span>
          <span className="btn mt-2 inline-flex">{label || "Submit"}</span>
        </span>
      );
    case "badge":
      return (
        <span className="pointer-events-none flex flex-wrap items-center justify-center gap-2 select-none" aria-hidden>
          <span className="badge bg-mint">{label || "New"}</span>
          <span className="badge bg-butter">{label || "Review"}</span>
          <span className="badge bg-lilac">{label || "Live"}</span>
        </span>
      );
    case "hero":
      return (
        <span className="pointer-events-none block w-full max-w-55 select-none" aria-hidden>
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-ember" />
            <span className="size-1.5 rounded-full bg-butter" />
            <span className="size-1.5 rounded-full bg-mint" />
          </span>
          <span className="font-primary mt-2 block truncate text-base font-medium tracking-tight">
            {label}
          </span>
          <span className="mt-1.5 block h-1.5 w-3/4 rounded-full bg-ink/10" />
          <span className="mt-1.5 block h-1.5 w-1/2 rounded-full bg-ink/10" />
          <span className="btn mt-2.5 inline-flex text-xs">Get started</span>
        </span>
      );
    case "card":
      return (
        <span className="pointer-events-none block w-full max-w-55 rounded-lg border border-line bg-white p-3 text-left select-none" aria-hidden>
          <span className="block h-10 rounded-md bg-mint" />
          <span className="font-primary mt-2 block truncate text-sm font-medium">{label}</span>
          <span className="mt-1.5 block h-1.5 w-full rounded-full bg-ink/10" />
          <span className="mt-1.5 block h-1.5 w-2/3 rounded-full bg-ink/10" />
        </span>
      );
    default:
      return (
        <span className="pointer-events-none flex w-full max-w-55 items-center gap-3 select-none" aria-hidden>
          <span className="font-primary flex size-10 shrink-0 items-center justify-center rounded-lg bg-lilac text-sm font-semibold">
            {label.trim().charAt(0).toUpperCase() || "?"}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{label}</span>
            <span className="mt-1.5 block h-1.5 w-full rounded-full bg-ink/10" />
            <span className="mt-1.5 block h-1.5 w-2/3 rounded-full bg-ink/10" />
          </span>
        </span>
      );
  }
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
          <div>
            <h3 className="font-primary text-lg font-medium tracking-tight">
              {current?.name ?? "No design system"}
            </h3>
            <p className="mt-1 text-xs text-smoke">
              {current
                ? current.space_id === spaceId
                  ? `Owned by this space · ${current.token_count} tokens`
                  : `Imported from ${current.space_name} · ${current.token_count} tokens`
                : "Pick one below to give this space a design system."}
            </p>
          </div>

          {/* Swapping systems is rare, so it stays folded away. */}
          {(!current || systems.length > 1) && (
            <details className="relative shrink-0">
              <summary className={`btn-quiet rounded-md ${SUMMARY}`}>Change</summary>
              <form action={useDesignSystem} className={`${POPOVER} mt-2 w-72 max-w-[80vw] p-3`}>
                <input type="hidden" name="spaceId" value={spaceId} />
                <fieldset className="grid gap-1">
                  <legend className="label mb-1 px-1">Use another space&apos;s system</legend>
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
    <div>
      <h2 className="font-primary text-2xl font-normal tracking-[-0.01em]">Components</h2>
      <p className="mt-1 text-sm text-smoke">
        Reusable UI built to the design system above.
      </p>

      <form action={createComponent} className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input type="hidden" name="spaceId" value={spaceId} />
        <input
          name="name"
          required
          maxLength={80}
          placeholder="Component name"
          aria-label="Component name"
          className="input sm:max-w-[12rem]"
        />
        <input
          name="description"
          maxLength={300}
          placeholder="What it does (optional)"
          aria-label="Component description"
          className="input"
        />
        <button type="submit" className="btn shrink-0 justify-center">
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
              {/* Preview first — every component reads visually, not just by name. */}
              <div className="flex h-36 items-center justify-center border-b border-line bg-paper p-4">
                <ComponentPreview name={component.name} description={component.description} />
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

function icon(className: string | undefined, children: React.ReactNode) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {children}
    </svg>
  );
}

const FileIcon = ({ className }: { className?: string }) =>
  icon(
    className,
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </>,
  );

const PlusIcon = ({ className }: { className?: string }) => icon(className, <path d="M12 5v14M5 12h14" />);

const DotsIcon = ({ className }: { className?: string }) =>
  icon(
    className,
    <>
      <circle cx="5" cy="12" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.25" fill="currentColor" stroke="none" />
    </>,
  );
