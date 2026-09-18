import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getSpace,
  listComponents,
  listDesignSystems,
  listImportable,
  listPages,
} from "@/db";
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

const date = (value: string) => new Date(value).toLocaleDateString("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export default async function SpacePage(props: PageProps<"/dashboard/[space]">) {
  const { space: slug } = await props.params;
  const query = await props.searchParams;
  const requested = Array.isArray(query.tab) ? query.tab[0] : query.tab;
  const tab: Tab = TABS.includes(requested as Tab) ? (requested as Tab) : "pages";

  const space = await getSpace(slug);
  if (!space) notFound();

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <header>
        <p className="text-sm text-smoke">Space</p>
        <h1 className="font-primary mt-1 text-4xl font-normal tracking-[-0.02em]">{space.name}</h1>
        <p className="mt-3 flex flex-wrap gap-2">
          <span className="badge badge-quiet">/{space.slug}</span>
          <span className="badge badge-quiet">
            {space.page_count} {space.page_count === 1 ? "page" : "pages"}
          </span>
          <span className="badge badge-quiet">
            {space.component_count} {space.component_count === 1 ? "component" : "components"}
          </span>
          <span className="badge">{space.design_system_name ?? "No design system"}</span>
        </p>
      </header>

      <nav className="mt-8 flex gap-1 border-b border-line pb-3">
        {TABS.map((name) => (
          <Link
            key={name}
            href={`/dashboard/${space.slug}?tab=${name}`}
            className="tab capitalize"
            data-active={tab === name}
          >
            {name === "design" ? "Design system" : name}
          </Link>
        ))}
      </nav>

      <div className="mt-8">
        {tab === "pages" && <PagesTab spaceId={space.id} />}
        {tab === "components" && <ComponentsTab spaceId={space.id} />}
        {tab === "design" && (
          <DesignTab spaceId={space.id} designSystemId={space.design_system_id} />
        )}
      </div>
    </main>
  );
}

async function PagesTab({ spaceId }: { spaceId: string }) {
  const pages = await listPages(spaceId);

  return (
    <section>
      <form action={createPage} className="flex flex-col gap-3 sm:flex-row">
        <input type="hidden" name="spaceId" value={spaceId} />
        <input
          name="title"
          required
          maxLength={120}
          placeholder="New page title"
          aria-label="New page title"
          className="input sm:max-w-xs"
        />
        <button type="submit" className="btn shrink-0 justify-center">
          Create page
        </button>
      </form>

      {pages.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-smoke">
          No pages in this space yet.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
          {pages.map((page) => (
            <li key={page.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{page.title}</p>
                <p className="truncate text-xs text-smoke">
                  /{page.slug} · {date(page.created_at)}
                </p>
              </div>
              <form action={deletePage}>
                <input type="hidden" name="id" value={page.id} />
                <input type="hidden" name="spaceId" value={spaceId} />
                <button type="submit" className="btn btn-quiet">
                  Delete
                </button>
              </form>
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
              <li key={component.id} className="card flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-primary text-base font-medium tracking-tight">
                    {component.name}
                  </h3>
                  <form action={deleteComponent}>
                    <input type="hidden" name="id" value={component.id} />
                    <input type="hidden" name="spaceId" value={spaceId} />
                    <button type="submit" className="btn btn-quiet">
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
