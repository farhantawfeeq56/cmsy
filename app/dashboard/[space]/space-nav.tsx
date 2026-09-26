"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { showsAnnotationToolbar } from "@/app/annotation-toolbar";

/**
 * Two levels, not three equal tabs: Pages are the content this space is for,
 * Design is the visual system behind it. Shared with `page.tsx`, which resolves
 * `?view=` against the same list.
 */
export const VIEWS = ["pages", "design"] as const;
export type View = (typeof VIEWS)[number];
export const LABEL: Record<View, string> = { pages: "Pages", design: "Design" };

const sectionHref = (slug: string, view: View) =>
  view === "pages" ? `/dashboard/${slug}` : `/dashboard/${slug}?view=design`;

type NavProps = { slug: string; view: View };

function Pills({ slug, view }: NavProps) {
  return (
    <nav
      aria-label="Space sections"
      className="flex shrink-0 gap-1 rounded-lg border border-line bg-card p-1"
    >
      {VIEWS.map((item) => (
        <Link
          key={item}
          href={sectionHref(slug, item)}
          aria-current={view === item ? "page" : undefined}
          data-active={view === item}
          className="tab"
        >
          {LABEL[item]}
        </Link>
      ))}
    </nav>
  );
}

function Underline({ slug, view }: NavProps) {
  return (
    <nav aria-label="Space sections" className="flex shrink-0 gap-5">
      {VIEWS.map((item) => (
        <Link
          key={item}
          href={sectionHref(slug, item)}
          aria-current={view === item ? "page" : undefined}
          className={`-mb-px border-b-2 pb-1.5 text-sm font-medium transition-colors ${
            view === item
              ? "border-ink text-ink"
              : "border-transparent text-smoke hover:text-ink"
          }`}
        >
          {LABEL[item]}
        </Link>
      ))}
    </nav>
  );
}

function Segmented({ slug, view }: NavProps) {
  return (
    <nav
      aria-label="Space sections"
      className="flex shrink-0 gap-1 rounded-full bg-[#1111110d] p-1"
    >
      {VIEWS.map((item) => (
        <Link
          key={item}
          href={sectionHref(slug, item)}
          aria-current={view === item ? "page" : undefined}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
            view === item
              ? "bg-white text-ink shadow-[0_1px_3px_#1111111f]"
              : "text-smoke hover:text-ink"
          }`}
        >
          {LABEL[item]}
        </Link>
      ))}
    </nav>
  );
}

function Cards({ slug, view }: NavProps) {
  return (
    <nav aria-label="Space sections" className="flex shrink-0 gap-2">
      {VIEWS.map((item) => (
        <Link
          key={item}
          href={sectionHref(slug, item)}
          aria-current={view === item ? "page" : undefined}
          className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
            view === item
              ? "border-ink/25 bg-white text-ink"
              : "border-line bg-card text-smoke hover:border-ink/15 hover:text-ink"
          }`}
        >
          <span
            aria-hidden
            className={`size-1.5 rounded-full ${view === item ? "bg-mint" : "bg-[#1111111f]"}`}
          />
          {LABEL[item]}
        </Link>
      ))}
    </nav>
  );
}

function Breadcrumb({ slug, view }: NavProps) {
  return (
    <nav aria-label="Space sections" className="flex shrink-0 items-center gap-2 text-sm">
      {VIEWS.map((item, index) => (
        <span key={item} className="flex items-center gap-2">
          {index > 0 && (
            <span aria-hidden className="text-smoke/30">
              /
            </span>
          )}
          <Link
            href={sectionHref(slug, item)}
            aria-current={view === item ? "page" : undefined}
            className={
              view === item ? "font-medium text-ink" : "text-smoke hover:text-ink"
            }
          >
            {LABEL[item]}
          </Link>
        </span>
      ))}
    </nav>
  );
}

const VARIANTS = [
  { name: "Pills", Nav: Pills },
  { name: "Underline", Nav: Underline },
  { name: "Segmented", Nav: Segmented },
  { name: "Cards", Nav: Cards },
  { name: "Breadcrumb", Nav: Breadcrumb },
];

/** The hostname never changes without a page load, so there is nothing to listen to. */
const neverChanges = () => () => {};

/**
 * The space's section nav, with five designs switchable from a floating toolbar
 * while we pick one (keys 1-5). Dev and Cloudflare previews only — same host
 * check as the annotation toolbar, so neither ever reaches production. Delete
 * the toolbar and the unused variants once a design is chosen.
 */
export function SpaceNav(props: NavProps) {
  // 3 — Segmented — is the one we picked; the rest stay switchable until the
  // toolbar comes out for good.
  const [index, setIndex] = useState(2);
  const visible = useSyncExternalStore(
    neverChanges,
    () => showsAnnotationToolbar(location.hostname),
    () => false,
  );

  useEffect(() => {
    if (!visible) return;
    const onKey = (event: KeyboardEvent) => {
      // The space page is full of inputs; a digit there is content, not a switch.
      if ((event.target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable]"))
        return;
      const choice = Number(event.key);
      if (choice >= 1 && choice <= VARIANTS.length) setIndex(choice - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible]);

  const { Nav } = VARIANTS[index];

  return (
    <>
      <Nav {...props} />
      {visible && (
        <div className="fixed right-4 bottom-4 z-50 flex items-center gap-1 rounded-full border border-line bg-white/95 p-1 shadow-[0_6px_20px_#1111111f] backdrop-blur">
          {VARIANTS.map((variant, i) => (
            <button
              key={variant.name}
              type="button"
              onClick={() => setIndex(i)}
              aria-pressed={index === i}
              data-active={index === i || undefined}
              title={`${variant.name} (${i + 1})`}
              className="tool"
            >
              {i + 1}
              <span className="hidden sm:inline">{variant.name}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
