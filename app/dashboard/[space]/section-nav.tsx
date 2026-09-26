"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { showsAnnotationToolbar } from "@/app/annotation-toolbar";

/**
 * Two levels, not three equal tabs: Pages are the content this space is for,
 * Design is the visual system behind it. `page.tsx` reads the type.
 */
export const VIEWS = ["pages", "design"] as const;
export type View = (typeof VIEWS)[number];
const LABEL: Record<View, string> = { pages: "Pages", design: "Design" };

/**
 * The settled design: a 5% ink track with the current section on Surface —
 * paper tones rather than a shadow, and 8px radii like the rest of the UI.
 */
function Nav({ slug, view }: { slug: string; view: View }) {
  return (
    <nav
      aria-label="Space sections"
      className="flex shrink-0 gap-1 rounded-lg bg-[#1111110d] p-1"
    >
      {VIEWS.map((item) => (
        <Link
          key={item}
          href={item === "pages" ? `/dashboard/${slug}` : `/dashboard/${slug}?view=design`}
          aria-current={view === item ? "page" : undefined}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            view === item ? "bg-card text-ink" : "text-smoke hover:text-ink"
          }`}
        >
          {LABEL[item]}
        </Link>
      ))}
    </nav>
  );
}

/**
 * A vartest over where the section nav sits on the page. The five positions are
 * five slots in `page.tsx`, so the choice is one module-level value they all
 * read rather than state any single one owns. Temporary: keep the winner,
 * delete the other four and the picker.
 */
const NAMES = ["Title right", "Title left", "Under left", "Under right", "Centered"];

let chosen = 1;
const listeners = new Set<() => void>();

const subscribe = (notify: () => void) => {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
};

const read = () => chosen;
const useSpot = () => useSyncExternalStore(subscribe, read, read);
const pick = (next: number) => {
  chosen = next;
  listeners.forEach((notify) => notify());
};

/**
 * The nav, in one of the five positions. Slots that did not win render nothing
 * at all — not an empty wrapper, which would leave a gap behind.
 */
export function SectionNav({
  placement,
  className,
  slug,
  view,
}: {
  placement: number;
  className?: string;
  slug: string;
  view: View;
}) {
  const spot = useSpot();

  if (spot !== placement) return null;

  const nav = <Nav slug={slug} view={view} />;
  return className ? <div className={className}>{nav}</div> : nav;
}

/**
 * The picker: a floating segmented control, keys 1-5, on dev and preview hosts
 * only. Same gate as the annotation toolbar, so it never reaches production.
 */
export function PlacementBar() {
  const spot = useSpot();
  const visible = useSyncExternalStore(
    subscribe,
    () => showsAnnotationToolbar(location.hostname),
    () => false,
  );

  useEffect(() => {
    if (!visible) return;
    const onKey = (event: KeyboardEvent) => {
      // This page is full of inputs; a digit there is content, not a switch.
      if ((event.target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable]"))
        return;
      const next = Number(event.key);
      if (next >= 1 && next <= NAMES.length) pick(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="fixed right-4 bottom-4 z-50 flex items-center gap-1 rounded-full border border-line bg-white/95 p-1 shadow-[0_6px_20px_#1111111f] backdrop-blur">
      {NAMES.map((name, index) => (
        <button
          key={name}
          type="button"
          onClick={() => pick(index + 1)}
          aria-pressed={spot === index + 1}
          data-active={spot === index + 1 || undefined}
          title={`${name} (${index + 1})`}
          className="tool"
        >
          {index + 1}
          <span className="hidden sm:inline">{name}</span>
        </button>
      ))}
    </div>
  );
}
