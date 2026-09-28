"use client";

import Link from "next/link";
import { type ReactNode } from "react";
import type { PageRow, Space } from "@/db";
import { createPage, deletePage, deleteSpace } from "../actions";
import { ago } from "../ago";
import { SpaceTitle } from "./space-title";

/** Everything `getSpace` returns for one space. */
type Shell = Omit<Space, "updated_at">;

/**
 * Two levels, not three equal tabs: Pages are the content this space is for,
 * Design is the visual system behind it.
 */
export type View = "pages" | "design";
const LABEL: Record<View, string> = { pages: "Pages", design: "Design" };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const POPOVER =
  "absolute right-0 z-10 rounded-xl border border-line bg-white shadow-[0_6px_12px_#11111114]";
const SUMMARY = "cursor-pointer list-none [&::-webkit-details-marker]:hidden";
/** A hairline control for a destructive-by-nature action, kept out of the way. */
const ICON_BUTTON =
  "flex size-8 shrink-0 items-center justify-center rounded-md text-smoke transition-colors hover:bg-[#1111110d] hover:text-ink";

/* ------------------------------------------------------------------ pieces */

/** The name is already a field, so Rename only has to put the caret in it. */
const focusName = () => {
  const input = document.querySelector<HTMLInputElement>("input[data-space-name]");
  input?.focus();
  input?.select();
};

/** The name being removed is named in the question, with what goes with it. */
const confirmDelete = (space: Shell) => (event: React.MouseEvent) => {
  const warning = `Delete “${space.name}”? This removes ${plural(space.page_count, "page")} and ${plural(space.component_count, "component")}, and cannot be undone.`;
  if (!confirm(warning)) event.preventDefault();
};

const sectionHref = (slug: string, view: View) =>
  view === "pages" ? `/dashboard/${slug}` : `/dashboard/${slug}?view=design`;

/**
 * The one destination worth a label — the section you are not on. It flips, so
 * a page that keeps only this link can still get back: the space view is the
 * default, but arriving on the design view must not be a dead end.
 */
const SwitchLink = ({
  slug,
  view,
  vertical,
}: {
  slug: string;
  view: View;
  vertical?: boolean;
}) => {
  const to = view === "pages" ? "design" : "pages";

  return (
    <Link
      href={sectionHref(slug, to)}
      className={`btn-quiet flex shrink-0 items-center gap-1.5 rounded-lg border border-line ${
        vertical ? "justify-center" : ""
      }`}
    >
      {LABEL[to]}
      <span aria-hidden>{to === "design" ? "→" : "←"}</span>
    </Link>
  );
};

/** 2 — the commands themselves, drawn: rename, delete, then the labelled way out. */
const Commands = ({
  space,
  view,
  vertical,
}: {
  space: Shell;
  view: View;
  vertical?: boolean;
}) => (
  <div
    className={`flex shrink-0 items-center gap-1 ${
      vertical ? "flex-col items-stretch" : ""
    }`}
  >
    <button
      type="button"
      onClick={focusName}
      aria-label="Rename space"
      title="Rename space"
      className={ICON_BUTTON}
    >
      <PencilIcon className="size-4" />
    </button>

    <form action={deleteSpace} className="contents">
      <input type="hidden" name="id" value={space.id} />
      <button
        type="submit"
        onClick={confirmDelete(space)}
        aria-label="Delete space"
        title="Delete space"
        className={ICON_BUTTON}
      >
        <TrashIcon className="size-4" />
      </button>
    </form>

    <span aria-hidden className={`bg-line ${vertical ? "my-1 h-px" : "mx-1 h-5 w-px"}`} />
    <SwitchLink slug={space.slug} view={view} vertical={vertical} />
  </div>
);

/**
 * The header's controls: the commands a space has, and the labelled way across
 * to the other half of it. A layout only decides where this cluster sits.
 */
function Cluster({
  space,
  view,
  vertical,
}: {
  space: Shell;
  view: View;
  vertical?: boolean;
}) {
  return <Commands space={space} view={view} vertical={vertical} />;
}

/** The space name, edited where it is read, with the action if it belongs here. */
function Title({
  space,
  size = "text-4xl tracking-[-0.02em]",
  className = "",
}: {
  space: Shell;
  size?: string;
  className?: string;
}) {
  return (
    <div className={`flex min-w-0 items-center gap-3 ${className}`}>
      <h1 className="min-w-0 flex-1">
        <SpaceTitle id={space.id} name={space.name} className={size} />
      </h1>
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

/** Delete, behind a menu so a row is not two buttons wide. */
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

/**
 * Add a page in place: the trigger and the form are one piece, so the list owns
 * no state and the popover is a native one either way. `labelled` is for the
 * empty state, where an unlabelled + has no list to sit against.
 */
function AddPage({ space, labelled }: { space: Shell; labelled?: boolean }) {
  return (
    <details className="relative">
      <summary
        aria-label="New page"
        title="New page"
        className={
          labelled
            ? `flex cursor-pointer list-none items-center gap-2 rounded-xl border border-dashed border-line px-4 py-2.5 text-sm text-smoke transition-colors hover:border-ink/25 hover:text-ink ${SUMMARY}`
            : `flex size-8 cursor-pointer list-none items-center justify-center rounded-md text-ink transition-colors hover:bg-[#1111110d] ${SUMMARY}`
        }
      >
        <PlusIcon className="size-4" />
        {labelled && "New page"}
      </summary>
      <PageForm space={space} />
    </details>
  );
}

/** Hairline page rows. The + is the first row, above the pages, empty or not. */
function Rows({
  space,
  pages,
  className = "",
}: {
  space: Shell;
  pages: PageRow[];
  className?: string;
}) {
  return (
    <ul className={`divide-y divide-line border-t border-line ${className}`}>
      {/* Above the first row, never below the list: a button under a long list is
          a button nobody scrolls to, and on an empty list it is all there is. */}
      <li className="flex justify-end py-1">
        <AddPage space={space} />
      </li>
      {pages.map((page) => (
        <li
          key={page.id}
          className="flex items-center gap-3 py-3.5"
        >
          <FileIcon className="size-4 shrink-0 text-smoke" />
          <Link
            href={pageHref(space.slug, page)}
            className="flex min-w-0 flex-1 items-center gap-3 py-1"
          >
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{page.title}</span>
          </Link>
          <span className="shrink-0 text-xs text-smoke">
            Created {ago(page.created_at)}
          </span>
          <DeleteMenu spaceId={space.id} page={page} />
        </li>
      ))}
    </ul>
  );
}

const Empty = ({ space, className = "" }: { space: Shell; className?: string }) => (
  <div
    className={`flex flex-col items-center gap-3 rounded-xl border border-dashed border-line px-6 py-10 text-center ${className}`}
  >
    <p className="text-sm text-smoke">No pages yet. Add the first one to start writing.</p>
    {/* The + row lives in the list, which does not exist yet, so the box carries
        its own — otherwise an empty space has no way to add anything. */}
    <AddPage space={space} labelled />
  </div>
);

/* ---------------------------------------------------------------- pieces */

type ShellProps = { space: Shell; pages: PageRow[]; view: View; design: ReactNode };

/** The list, or whatever the Design view brought instead. */
const Body = (p: ShellProps) =>
  p.view === "design" ? (
    <div>{p.design}</div>
  ) : p.pages.length ? (
    <Rows space={p.space} pages={p.pages} />
  ) : (
    <Empty space={p.space} />
  );

/** What is in this view: pages on one side, components on the other. */
const countText = (p: ShellProps) =>
  p.view === "design"
    ? plural(p.space.component_count, "component")
    : plural(p.pages.length, "page");

/** A section heading and its count, the way the Pages and Design bands read. */
const Band = (p: ShellProps) => (
  <div>
    <h2 className="font-primary text-2xl font-normal tracking-[-0.01em]">
      {p.view === "design" ? "Design" : "Pages"}
    </h2>
    <p className="mt-1 text-sm text-smoke">{countText(p)}</p>
  </div>
);

/** The settled arrangement: a title row, a band that names what is below it, the body. */
const ShellPage = (p: ShellProps) => (
  <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-10">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <Title space={p.space} />
      <Cluster space={p.space} view={p.view} />
    </header>
    <section className="flex flex-col gap-5 border-t border-line pt-6">
      <Band {...p} />
      <Body {...p} />
    </section>
  </main>
);

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
  return <ShellPage space={space} pages={pages} view={view} design={design} />;
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

const PencilIcon = ({ className }: { className?: string }) =>
  icon(
    className,
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </>,
  );

const TrashIcon = ({ className }: { className?: string }) =>
  icon(
    className,
    <>
      <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
      <path d="M10 11v5M14 11v5" />
    </>,
  );
