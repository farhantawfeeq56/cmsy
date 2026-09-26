"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { showsAnnotationToolbar } from "@/app/annotation-toolbar";

/**
 * A vartest over where the design-system entry point lives on `/dashboard/[space]`.
 * The five placements sit in five places in `page.tsx`, so the choice is one
 * module-level value they all read, rather than state any single one owns.
 * Temporary: keep the winner, delete the other four and the toolbar.
 */
const NAMES = ["Strip", "Chip", "Section", "List row", "Footer"];

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

/** `?view=design` is the space's design system and components. */
const href = (slug: string) => `/dashboard/${slug}?view=design`;

/** What the design system is called, and how much is in it. */
export type DesignContext = { name: string; components: number };

const Summary = ({ context, className }: { context: DesignContext; className: string }) => (
  <>
    <span aria-hidden className="size-2 shrink-0 rounded-full bg-mint" />
    <span className={`min-w-0 truncate ${className}`}>
      <span className="font-medium">{context.name}</span>
      <span className="text-smoke">
        {" · "}
        {context.components} {context.components === 1 ? "component" : "components"}
      </span>
    </span>
  </>
);

type EntryProps = { slug: string; context: DesignContext };

/** 1 — the strip under the header, where it used to be. */
export function DesignStrip({ slug, context }: EntryProps) {
  if (useSpot() !== 1) return null;

  return (
    <Link
      href={href(slug)}
      className="group flex items-center gap-3 rounded-xl border border-line bg-card px-4 py-3 transition-colors hover:border-ink/20"
    >
      <Summary context={context} className="flex-1 text-sm" />
      <span aria-hidden className="shrink-0 text-xs text-smoke group-hover:text-ink">
        Design →
      </span>
    </Link>
  );
}

/** 2 — a pill beside the space name. */
export function DesignChip({ slug, context }: EntryProps) {
  if (useSpot() !== 2) return null;

  return (
    <Link href={href(slug)} className="badge badge-quiet shrink-0">
      <Summary context={context} className="text-xs" />
    </Link>
  );
}

/** 3 — a quiet button in the Pages section header, next to New Page. */
export function DesignSection({ slug, context }: EntryProps) {
  if (useSpot() !== 3) return null;

  return (
    <Link
      href={href(slug)}
      className="flex items-center gap-2 rounded-lg border border-line bg-card px-3 py-2.5 transition-colors hover:border-ink/20"
    >
      <Summary context={context} className="text-sm" />
    </Link>
  );
}

/** 4 — the first row of the pages list: context where the content is. */
export function DesignListRow({ slug, context }: EntryProps) {
  if (useSpot() !== 4) return null;

  return (
    <li className="py-1">
      <Link
        href={href(slug)}
        className="group flex items-center gap-3 rounded-lg border border-dashed border-line px-3 py-2.5 transition-colors hover:border-ink/20"
      >
        <Summary context={context} className="flex-1 text-sm" />
        <span aria-hidden className="shrink-0 text-xs text-smoke group-hover:text-ink">
          Design →
        </span>
      </Link>
    </li>
  );
}

/** 5 — one quiet line at the foot of the page. */
export function DesignFooter({ slug, context }: EntryProps) {
  if (useSpot() !== 5) return null;

  return (
    <Link
      href={href(slug)}
      className="group flex items-center justify-center gap-3 rounded-xl border border-line px-4 py-3 transition-colors hover:border-ink/20"
    >
      <Summary context={context} className="text-sm" />
      <span aria-hidden className="shrink-0 text-xs text-smoke group-hover:text-ink">
        Design →
      </span>
    </Link>
  );
}

/**
 * The picker: a floating segmented control, keys 1-5, on dev and preview hosts
 * only. Same gate as the annotation toolbar, so it never reaches production.
 */
export function SpotBar() {
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
      const pick = Number(event.key);
      if (pick >= 1 && pick <= NAMES.length) {
        chosen = pick;
        listeners.forEach((notify) => notify());
      }
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
          onClick={() => {
            chosen = index + 1;
            listeners.forEach((notify) => notify());
          }}
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
