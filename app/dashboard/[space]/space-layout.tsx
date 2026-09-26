"use client";

import Link from "next/link";
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { showsAnnotationToolbar } from "@/app/annotation-toolbar";
import type { PageRow, Space } from "@/db";
import { createPage, deletePage, deleteSpace } from "../actions";
import { ago } from "../ago";
import { SpaceTitle } from "./space-title";

/** Everything `getSpace` returns for one space. */
type Shell = Omit<Space, "updated_at">;

export const VIEWS = ["pages", "design"] as const;
export type View = (typeof VIEWS)[number];
const LABEL: Record<View, string> = { pages: "Pages", design: "Design" };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const POPOVER =
  "absolute right-0 z-10 rounded-xl border border-line bg-white shadow-[0_6px_12px_#11111114]";
const SUMMARY = "cursor-pointer list-none [&::-webkit-details-marker]:hidden";

/* ------------------------------------------------------------------ pieces */

/** The settled segmented control: a 5% ink track, the current section on Surface. */
function Nav({ slug, view, vertical }: { slug: string; view: View; vertical?: boolean }) {
  return (
    <nav
      aria-label="Space sections"
      className={`flex shrink-0 gap-1 rounded-lg bg-[#1111110d] p-1 ${
        vertical ? "flex-col" : ""
      }`}
    >
      {VIEWS.map((item) => (
        <Link
          key={item}
          href={item === "pages" ? `/dashboard/${slug}` : `/dashboard/${slug}?view=design`}
          aria-current={view === item ? "page" : undefined}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            vertical ? "text-center" : ""
          } ${view === item ? "bg-card text-ink" : "text-smoke hover:text-ink"}`}
        >
          {LABEL[item]}
        </Link>
      ))}
    </nav>
  );
}

/**
 * The controls a space was missing: rename (the name itself is the field, so
 * this only puts the caret in it), a way through to its design system, and the
 * one irreversible act — deleting it, with what it takes named first.
 */
function SpaceMenu({
  space,
  onRename,
}: {
  space: Shell;
  onRename: () => void;
}) {
  const pages = plural(space.page_count, "page");
  const components = plural(space.component_count, "component");

  return (
    <details className="relative shrink-0">
      <summary
        aria-label="Space actions"
        className={`flex size-8 items-center justify-center rounded-md text-smoke transition-colors hover:bg-[#1111110d] hover:text-ink ${SUMMARY}`}
      >
        <DotsIcon className="size-4" />
      </summary>

      <div className={`${POPOVER} mt-1 w-60 p-1`}>
        <button
          type="button"
          onClick={onRename}
          className="btn-quiet flex w-full justify-start rounded-md"
        >
          Rename space
        </button>

        <Link
          href={`/dashboard/${space.slug}?view=design`}
          className="btn-quiet flex w-full justify-start rounded-md"
        >
          Design system
        </Link>

        <form action={deleteSpace} className="border-t border-line pt-1">
          <input type="hidden" name="id" value={space.id} />
          <button
            type="submit"
            onClick={(event) => {
              const warning = `Delete “${space.name}”? This removes ${pages} and ${components}, and cannot be undone.`;
              if (!confirm(warning)) event.preventDefault();
            }}
            className="btn-quiet flex w-full justify-start rounded-md"
          >
            {/* A signal dot rather than orange text: DESIGN.md keeps ember for the
                dot, and #E8400D on paper is too light for a 13px label. */}
            <span aria-hidden className="size-1.5 rounded-full bg-ember" />
            Delete space
          </button>
        </form>
      </div>
    </details>
  );
}

/** The space name, edited where it is read, with the space's controls beside it. */
function Title({
  space,
  size = "text-4xl tracking-[-0.02em]",
  className = "",
}: {
  space: Shell;
  size?: string;
  className?: string;
}) {
  const wrapper = useRef<HTMLDivElement>(null);

  // The name is already an editable field; Rename only has to point at it.
  const rename = () => {
    const input = wrapper.current?.querySelector("input");
    input?.focus();
    input?.select();
  };

  return (
    <div ref={wrapper} className={`flex min-w-0 items-center gap-1 ${className}`}>
      <h1 className="min-w-0 flex-1">
        <SpaceTitle id={space.id} name={space.name} className={size} />
      </h1>
      <SpaceMenu space={space} onRename={rename} />
    </div>
  );
}

const PageForm = ({ space }: { space: Shell }) => (
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
);

/** Native <details> popover, so a trigger needs no client state. */
function NewPage({
  space,
  tone = "btn",
  className = "",
}: {
  space: Shell;
  tone?: "btn" | "quiet" | "row";
  className?: string;
}) {
  if (tone === "row")
    return (
      <details className={`relative ${className}`}>
        <summary
          className={`flex cursor-pointer list-none items-center gap-2 rounded-lg border border-dashed border-line px-3 py-3 text-sm text-smoke transition-colors hover:border-ink/20 hover:text-ink ${SUMMARY}`}
        >
          <PlusIcon className="size-4" />
          New page
        </summary>
        <PageForm space={space} />
      </details>
    );

  return (
    <details className={`relative shrink-0 ${className}`}>
      <summary
        className={`${tone === "quiet" ? "btn-quiet rounded-lg border border-line" : "btn"} ${SUMMARY}`}
      >
        <PlusIcon className="size-4" />
        New Page
      </summary>
      <PageForm space={space} />
    </details>
  );
}

function DeleteMenu({ spaceId, page }: { spaceId: string; page: PageRow }) {
  return (
    <details className="relative shrink-0">
      <summary
        aria-label={`Actions for ${page.title}`}
        className={`flex size-8 items-center justify-center rounded-md text-smoke transition-colors hover:bg-[#1111110d] hover:text-ink ${SUMMARY}`}
      >
        <DotsIcon className="size-4" />
      </summary>
      <form action={deletePage} className={`${POPOVER} mt-1 p-1`}>
        <input type="hidden" name="id" value={page.id} />
        <input type="hidden" name="spaceId" value={spaceId} />
        <button type="submit" className="btn-quiet flex w-full justify-start rounded-md">
          Delete page
        </button>
      </form>
    </details>
  );
}

const pageHref = (slug: string, page: PageRow) => `/dashboard/${slug}/pages/${page.slug}`;

/** Hairline rows. `dense` drops the icon and the timestamp to fit more per screen. */
function Rows({
  space,
  pages,
  dense,
  className = "",
}: {
  space: Shell;
  pages: PageRow[];
  dense?: boolean;
  className?: string;
}) {
  return (
    <ul className={`divide-y divide-line border-t border-line ${className}`}>
      {pages.map((page) => (
        <li
          key={page.id}
          className={`flex items-center gap-3 ${dense ? "py-2" : "py-3.5"}`}
        >
          {!dense && <FileIcon className="size-4 shrink-0 text-smoke" />}
          <Link
            href={pageHref(space.slug, page)}
            className="flex min-w-0 flex-1 items-center gap-3 py-1"
          >
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{page.title}</span>
          </Link>
          {!dense && (
            <span className="shrink-0 text-xs text-smoke">Created {ago(page.created_at)}</span>
          )}
          <DeleteMenu spaceId={space.id} page={page} />
        </li>
      ))}
    </ul>
  );
}

function Cards({
  space,
  pages,
  className = "",
}: {
  space: Shell;
  pages: PageRow[];
  className?: string;
}) {
  return (
    <ul className={`grid gap-3 sm:grid-cols-2 ${className}`}>
      {pages.map((page) => (
        <li
          key={page.id}
          className="flex items-start justify-between gap-3 rounded-xl border border-line bg-card p-4 transition-colors hover:border-ink/20"
        >
          <Link href={pageHref(space.slug, page)} className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{page.title}</span>
            <span className="mt-1 block text-xs text-smoke">
              Created {ago(page.created_at)}
            </span>
          </Link>
          <DeleteMenu spaceId={space.id} page={page} />
        </li>
      ))}
    </ul>
  );
}

/** Rows in a real table, with a header row and a toolbar strip above it. */
function Table({ space, pages }: { space: Shell; pages: PageRow[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line">
      <div className="flex items-center justify-between gap-3 border-b border-line bg-card px-4 py-2">
        <span className="label">{plural(pages.length, "page")}</span>
        <NewPage space={space} tone="quiet" />
      </div>
      <table className="w-full table-fixed">
        <thead>
          <tr className="border-b border-line text-left">
            <th className="label px-4 py-2 font-medium">Title</th>
            <th className="label w-32 px-4 py-2 font-medium">Created</th>
            <th className="w-12" />
          </tr>
        </thead>
        <tbody>
          {pages.map((page) => (
            <tr
              key={page.id}
              className="border-b border-line transition-colors last:border-0 hover:bg-[#11111108]"
            >
              <td className="px-4 py-2">
                <Link href={pageHref(space.slug, page)} className="block truncate text-sm font-medium">
                  {page.title}
                </Link>
              </td>
              <td className="px-4 py-2 text-xs text-smoke">{ago(page.created_at)}</td>
              <td className="px-1 py-1">
                <DeleteMenu spaceId={space.id} page={page} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const Empty = ({ className = "" }: { className?: string }) => (
  <p
    className={`rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-smoke ${className}`}
  >
    No pages yet. Add the first one to start writing.
  </p>
);

/** The Pages heading and its count, with the action on the right. */
const PagesHead = ({
  space,
  pages,
  action = "btn",
}: {
  space: Shell;
  pages: PageRow[];
  action?: "btn" | "quiet";
}) => (
  <div className="flex flex-wrap items-end justify-between gap-3">
    <div>
      <h2 className="font-primary text-2xl font-normal tracking-[-0.01em]">Pages</h2>
      <p className="mt-1 text-sm text-smoke">{plural(pages.length, "page")}</p>
    </div>
    <NewPage space={space} tone={action} />
  </div>
);

/* ---------------------------------------------------------------- layouts */

type LayoutProps = { space: Shell; pages: PageRow[]; view: View };

/** The title row and the nav, as every layout but one used to get it. */
const TitleRow = ({ space, view, size }: LayoutProps & { size?: string }) => (
  <header className="flex flex-wrap items-end justify-between gap-4">
    <Title space={space} size={size} />
    <Nav slug={space.slug} view={view} />
  </header>
);

const List = ({ space, pages, className = "" }: LayoutProps & { className?: string }) =>
  pages.length ? (
    <Rows space={space} pages={pages} className={className} />
  ) : (
    <Empty className={className} />
  );

/** 1 — as it is today: title row, a Pages band, then the list. */
const Today = (p: LayoutProps) => (
  <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-10">
    <TitleRow {...p} />
    <section className="border-t border-line pt-6">
      <PagesHead space={p.space} pages={p.pages} />
      <List {...p} className="mt-5" />
    </section>
  </main>
);

/** 2 — one bar: name, count, nav and the action together, no Pages band. */
const Toolbar = (p: LayoutProps) => (
  <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-6 py-8">
    <div className="flex flex-wrap items-center gap-3 border-b border-line pb-4">
      <Title space={p.space} size="text-2xl tracking-[-0.01em]" className="flex-1" />
      <span className="shrink-0 text-xs text-smoke">{plural(p.pages.length, "page")}</span>
      <Nav slug={p.space.slug} view={p.view} />
      <NewPage space={p.space} tone="quiet" />
    </div>
    <List {...p} />
  </main>
);

/** 3 — the space is the page: display name, nav under it, no heading above the list. */
const Hero = (p: LayoutProps) => (
  <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-14">
    <header className="flex flex-col items-start gap-5">
      <p className="label">Space</p>
      <Title space={p.space} size="text-[3.5rem] tracking-[-0.05em]" />
      <Nav slug={p.space.slug} view={p.view} />
    </header>
    <section className="flex flex-col gap-2">
      <p className="label">{plural(p.pages.length, "page")}</p>
      <List {...p} />
      <NewPage space={p.space} tone="row" className="mt-3" />
    </section>
  </main>
);

/** 4 — the space and its sections in a left column, the pages in the other. */
const Sidebar = (p: LayoutProps) => (
  <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10 md:flex-row md:gap-12">
    <aside className="flex shrink-0 flex-col gap-5 md:w-56">
      <Title space={p.space} size="text-2xl tracking-[-0.01em]" />
      <Nav slug={p.space.slug} view={p.view} vertical />
    </aside>
    <section className="min-w-0 flex-1">
      <PagesHead space={p.space} pages={p.pages} />
      <List {...p} className="mt-5" />
    </section>
  </main>
);

/** 5 — the nav floats at the foot of the canvas, so the top is name and pages only. */
const Floating = (p: LayoutProps) => (
  <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-10 pb-28">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <Title space={p.space} />
      <NewPage space={p.space} />
    </header>
    <section className="flex flex-col gap-3 border-t border-line pt-6">
      <p className="label">{plural(p.pages.length, "page")}</p>
      <List {...p} />
    </section>
    <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-lg bg-paper/95 p-1 backdrop-blur">
      <Nav slug={p.space.slug} view={p.view} />
    </div>
  </main>
);

/** 6 — pages as cards, two to a row. */
const CardGrid = (p: LayoutProps) => (
  <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-10">
    <TitleRow {...p} />
    <section>
      <PagesHead space={p.space} pages={p.pages} />
      {p.pages.length ? (
        <Cards space={p.space} pages={p.pages} className="mt-5" />
      ) : (
        <Empty className="mt-5" />
      )}
    </section>
  </main>
);

/** 7 — the same page with the air taken out: smaller title, tighter rows. */
const Dense = (p: LayoutProps) => (
  <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-6 py-8">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <Title space={p.space} size="text-2xl tracking-[-0.01em]" />
      <Nav slug={p.space.slug} view={p.view} />
    </header>
    <section>
      <div className="flex items-center justify-between gap-3 border-b border-line pb-2">
        <h2 className="label">Pages · {p.pages.length}</h2>
        <NewPage space={p.space} tone="quiet" />
      </div>
      {p.pages.length ? (
        <Rows space={p.space} pages={p.pages} dense />
      ) : (
        <Empty className="mt-4" />
      )}
    </section>
  </main>
);

/** 8 — the title row sticks to the top while a long list scrolls under it. */
const Sticky = (p: LayoutProps) => (
  <main className="mx-auto flex w-full max-w-4xl flex-col px-6">
    <div className="sticky top-0 z-30 flex flex-wrap items-end justify-between gap-4 border-b border-line bg-paper/95 py-5 backdrop-blur">
      <Title space={p.space} size="text-2xl tracking-[-0.01em]" />
      <Nav slug={p.space.slug} view={p.view} />
    </div>
    <section className="flex flex-col gap-5 py-8">
      <PagesHead space={p.space} pages={p.pages} />
      <List {...p} />
    </section>
  </main>
);

/** 9 — a console: the pages in a table with a header row and a toolbar strip. */
const Console = (p: LayoutProps) => (
  <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-10">
    <TitleRow {...p} />
    <section>
      {p.pages.length ? (
        <Table space={p.space} pages={p.pages} />
      ) : (
        <>
          <PagesHead space={p.space} pages={p.pages} />
          <Empty className="mt-5" />
        </>
      )}
    </section>
  </main>
);

/** 10 — a narrow centred column, the document arrangement. */
const Centered = (p: LayoutProps) => (
  <main className="mx-auto flex w-full max-w-xl flex-col items-center gap-6 px-6 py-14">
    <Title
      space={p.space}
      size="text-center text-4xl tracking-[-0.02em]"
      className="w-full"
    />
    <Nav slug={p.space.slug} view={p.view} />
    <p className="label">{plural(p.pages.length, "page")}</p>
    <List {...p} className="w-full" />
    <NewPage space={p.space} tone="quiet" />
  </main>
);

const LAYOUTS = [
  { name: "Today", view: Today },
  { name: "Toolbar", view: Toolbar },
  { name: "Hero", view: Hero },
  { name: "Sidebar", view: Sidebar },
  { name: "Floating", view: Floating },
  { name: "Cards", view: CardGrid },
  { name: "Dense", view: Dense },
  { name: "Sticky", view: Sticky },
  { name: "Table", view: Console },
  { name: "Centered", view: Centered },
];

/* ------------------------------------------------------------- the picker */

/**
 * A vartest over how the space page is arranged. Ten layouts, one chosen value
 * at module scope so the bar and the page cannot disagree. Temporary: keep the
 * winner, delete the other nine and this picker.
 */
let chosen = 0;
const listeners = new Set<() => void>();

const subscribe = (notify: () => void) => {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
};

const read = () => chosen;
const useLayout = () => useSyncExternalStore(subscribe, read, read);
const pick = (next: number) => {
  chosen = next;
  listeners.forEach((notify) => notify());
};

/** Ten numbers do not fit keyed 1-10, so 0 is the tenth. */
const keyFor = (event: KeyboardEvent) => {
  if ((event.target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable]"))
    return null;
  if (event.key === "0") return 10;
  const digit = Number(event.key);
  return digit >= 1 && digit <= 9 ? digit : null;
};

export function SpaceLayout({
  space,
  pages,
  view,
  design,
}: {
  space: Shell;
  pages: PageRow[];
  view: View;
  design: ReactNode;
}) {
  const index = useLayout();
  const Layout = LAYOUTS[index].view;

  return (
    <>
      {view === "design" ? (
        <main className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-6 py-10">
          <TitleRow space={space} pages={pages} view={view} />
          {design}
        </main>
      ) : (
        <Layout space={space} pages={pages} view={view} />
      )}
      <LayoutBar />
    </>
  );
}

function LayoutBar() {
  const index = useLayout();
  const visible = useSyncExternalStore(
    subscribe,
    () => showsAnnotationToolbar(location.hostname),
    () => false,
  );

  useEffect(() => {
    if (!visible) return;
    const onKey = (event: KeyboardEvent) => {
      const key = keyFor(event);
      if (key) pick(key - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="fixed right-4 bottom-4 z-50 flex items-center gap-1 rounded-full border border-line bg-white/95 p-1 shadow-[0_6px_20px_#1111111f] backdrop-blur">
      <span className="label px-2">{LAYOUTS[index].name}</span>
      {LAYOUTS.map((layout, i) => (
        <button
          key={layout.name}
          type="button"
          onClick={() => pick(i)}
          aria-pressed={index === i}
          data-active={index === i || undefined}
          title={`${layout.name} (${i === 9 ? 0 : i + 1})`}
          className="tool"
        >
          {i + 1}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ icons */

function icon(className: string | undefined, children: ReactNode) {
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

const PlusIcon = ({ className }: { className?: string }) =>
  icon(className, <path d="M12 5v14M5 12h14" />);

const DotsIcon = ({ className }: { className?: string }) =>
  icon(
    className,
    <>
      <circle cx="5" cy="12" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.25" fill="currentColor" stroke="none" />
    </>,
  );
