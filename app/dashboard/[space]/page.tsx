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

const TABS = ["pages", "components", "design"] as const;
type Tab = (typeof TABS)[number];

/** Shared by the New Page popover and the row menus. */
const POPOVER =
  "absolute right-0 z-10 rounded-xl border border-line bg-white shadow-[0_6px_12px_#11111114]";
const SUMMARY = "cursor-pointer list-none [&::-webkit-details-marker]:hidden";

export default async function SpacePage(props: PageProps<"/dashboard/[space]">) {
  const { space: slug } = await props.params;
  const query = await props.searchParams;
  const requested = Array.isArray(query.tab) ? query.tab[0] : query.tab;
  const tab: Tab = TABS.includes(requested as Tab) ? (requested as Tab) : "pages";

  const space = await getSpace(slug);
  if (!space) notFound();

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-10">
      <header className="min-w-0">
        <h1 className="font-primary text-4xl font-normal tracking-[-0.02em]">{space.name}</h1>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-smoke">
          Build and manage your pages, components and design system.
        </p>
      </header>

      {tab === "pages" ? (
        <PagesTab space={space} />
      ) : (
        <div>
          {/* The tiles are the way into these views, so they need a way back. */}
          <Link
            href={`/dashboard/${space.slug}?tab=pages`}
            className="btn btn-quiet -ml-2.5 mb-4"
          >
            ← Pages
          </Link>
          {tab === "components" ? (
            <ComponentsTab spaceId={space.id} />
          ) : (
            <DesignTab spaceId={space.id} designSystemId={space.design_system_id} />
          )}
        </div>
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

async function PagesTab({ space }: { space: SpaceSummary }) {
  const pages = await listPages(space.id);

  return (
    <section>
      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href={`/dashboard/${space.slug}?tab=components`}
          className="group flex items-center gap-4 rounded-xl border border-line bg-white p-4 transition-colors hover:border-ink/20"
        >
          <span
            aria-hidden
            className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-lilac"
          >
            <CubeIcon className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="font-primary block truncate text-base font-medium tracking-tight">
              Components
            </span>
            <span className="block text-sm text-smoke">
              {space.component_count}{" "}
              {space.component_count === 1 ? "component" : "components"}
            </span>
          </span>
          <span aria-hidden className="shrink-0 text-smoke transition-colors group-hover:text-ink">
            →
          </span>
        </Link>

        <Link
          href={`/dashboard/${space.slug}?tab=design`}
          className="group flex items-center gap-4 rounded-xl border border-line bg-white p-4 transition-colors hover:border-ink/20"
        >
          <span
            aria-hidden
            className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-mint"
          >
            <PencilIcon className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="font-primary block truncate text-base font-medium tracking-tight">
              Design System
            </span>
            <span className="block truncate text-sm text-smoke">
              {space.design_system_name ?? "Not set"}
            </span>
          </span>
          <span
            aria-hidden
            className="shrink-0 text-base text-smoke transition-colors group-hover:text-ink"
          >
            →
          </span>
        </Link>
      </div>

      <div className="mt-8 flex items-start justify-between gap-4 border-t border-line pt-6">
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
          No pages yet. Add the first one to start building.
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

async function ComponentsTab({ spaceId }: { spaceId: string }) {
  const [components, importable] = await Promise.all([
    listComponents(spaceId),
    listImportable(spaceId),
  ]);

  return (
    <section className="space-y-8">
      <div>
        <h2 className="font-primary text-xl font-medium tracking-tight">Components</h2>
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
                className="card flex flex-col gap-2"
              >
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
                <p className="mt-auto">
                  {component.origin_space_name ? (
                    <span className="badge">
                      Imported · {component.origin_name} from {component.origin_space_name}
                    </span>
                  ) : (
                    <span className="badge badge-quiet">Local</span>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h2 className="font-primary text-xl font-medium tracking-tight">Import from another space</h2>
        <p className="mt-1 text-sm text-smoke">
          Imported components stay linked to the space they came from, so you can
          tell them apart from local ones.
        </p>
        {importable.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-line px-6 py-6 text-sm text-smoke">
            Nothing left to import from other spaces.
          </p>
        ) : (
          <form action={importComponent} className="mt-4 flex flex-col gap-3 sm:flex-row">
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
      </div>
    </section>
  );
}

async function DesignTab({
  spaceId,
  designSystemId,
}: {
  spaceId: string;
  designSystemId: string | null;
}) {
  const systems = await listDesignSystems();
  const current = systems.find((system) => system.id === designSystemId);

  return (
    <section>
      <div className="card">
        <p className="label">In use</p>
        <h2 className="font-primary mt-1 text-xl font-medium tracking-tight">
          {current?.name ?? "No design system"}
        </h2>
        <p className="mt-2 text-sm text-smoke">
          {current
            ? current.space_id === spaceId
              ? `Owned by this space · ${current.token_count} tokens`
              : `Imported from ${current.space_name} · ${current.token_count} tokens`
            : "Pick one below to give this space a design system."}
        </p>
      </div>

      <form action={useDesignSystem} className="mt-6">
        <input type="hidden" name="spaceId" value={spaceId} />
        <fieldset className="grid gap-2">
          <legend className="label mb-2">Own it or import another space&apos;s</legend>
          {systems.map((system) => (
            <label
              key={system.id}
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-line bg-card px-4 py-3"
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
                <span className="block text-xs text-smoke">
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
        <button type="submit" className="btn mt-4">
          Use selected system
        </button>
      </form>
    </section>
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

const CubeIcon = ({ className }: { className?: string }) =>
  icon(
    className,
    <>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <path d="M3.27 6.96 12 12.01l8.73-5.05M12 22.08V12" />
    </>,
  );

const PencilIcon = ({ className }: { className?: string }) =>
  icon(
    className,
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </>,
  );

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
