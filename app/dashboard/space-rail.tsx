"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react";
import type { Space } from "@/db";

const TILES = ["bg-mint", "bg-butter", "bg-lilac"];

/** Fixed class list rather than an inline transform, so Tailwind can see it. */
const FAN = ["-rotate-3", "-rotate-2", "rotate-0", "rotate-2", "rotate-3"];

const initial = (value: string) => value.trim().charAt(0).toUpperCase() || "?";

const meta = (space: Space) =>
  `${space.page_count} ${space.page_count === 1 ? "page" : "pages"} · ${space.component_count} ${
    space.component_count === 1 ? "component" : "components"
  }`;

type RailRef = RefObject<HTMLUListElement | null>;

/** The rail's prev/next controls. Dimmed at each end so a click never does nothing. */
const NavButton = ({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) => (
  <button
    type="button"
    aria-label={label}
    disabled={disabled}
    onClick={onClick}
    className="flex size-9 items-center justify-center rounded-full border border-line bg-card text-lg leading-none text-ink transition-colors hover:border-ink/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal disabled:opacity-30 disabled:hover:border-line"
  >
    <span aria-hidden>{children}</span>
  </button>
);

/**
 * Whether the rail can still move each way, read from the DOM rather than
 * mirrored into state: scroll position is the browser's, not ours.
 * `useSyncExternalStore` is the same pattern `annotation-toolbar.tsx` uses.
 */
function useRailEdges(railRef: RailRef) {
  const subscribe = useCallback(
    (notify: () => void) => {
      const rail = railRef.current;
      if (!rail) return () => {};

      rail.addEventListener("scroll", notify, { passive: true });
      // Catches the first measurement and any resize, where `scroll` is silent.
      const observer = new ResizeObserver(notify);
      observer.observe(rail);

      return () => {
        rail.removeEventListener("scroll", notify);
        observer.disconnect();
      };
    },
    [railRef],
  );

  // A string, so the snapshot compares by value and cannot loop.
  const snapshot = useSyncExternalStore(
    subscribe,
    () => {
      const rail = railRef.current;
      if (!rail) return "false|false";
      const end = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 1;
      return `${rail.scrollLeft > 1}|${!end}`;
    },
    () => "false|false",
  );

  const [prev, next] = snapshot.split("|");
  return { prev: prev === "true", next: next === "true" };
}

/** Where the rail's prev/next controls sit. Under review — see `spaces-section.tsx`. */
export type RailControls =
  | "above"
  | "labelled"
  | "above-centre"
  | "overlay"
  | "split"
  | "below"
  | "below-centre";

/**
 * The spaces as a fanned deck: cards overlap and sit at an angle, and the rail
 * moves by its own controls rather than a scrollbar. The spacing is the tightest
 * of the four that were compared.
 */
export function SpaceRail({
  spaces,
  controls = "above",
}: {
  spaces: Space[];
  controls?: RailControls;
}) {
  const railRef = useRef<HTMLUListElement>(null);
  const edges = useRailEdges(railRef);

  /** One screenful, minus a sliver so the next card stays visible. */
  const nudge = useCallback((direction: 1 | -1) => {
    const rail = railRef.current;
    if (!rail) return;

    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    rail.scrollBy({
      left: direction * rail.clientWidth * 0.85,
      behavior: reduced ? "auto" : "smooth",
    });
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable=true]")) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      // Otherwise the page scrolls sideways as well.
      event.preventDefault();
      nudge(event.key === "ArrowLeft" ? -1 : 1);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nudge]);

  const previous = (
    <NavButton label="Previous spaces" disabled={!edges.prev} onClick={() => nudge(-1)}>
      ‹
    </NavButton>
  );
  const next = (
    <NavButton label="Next spaces" disabled={!edges.next} onClick={() => nudge(1)}>
      ›
    </NavButton>
  );

  const track = (
    <ul
      ref={railRef}
      className="-mx-6 mt-2 flex snap-x snap-mandatory items-end gap-4 overflow-x-auto px-6 pt-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {spaces.map((space, index) => (
        <li
          key={space.id}
          className={`relative shrink-0 snap-start scroll-ml-4 ${index > 0 ? "-ml-12" : ""}`}
        >
          <Link
            href={`/dashboard/${space.slug}`}
            className={`font-primary flex h-60 w-52 origin-bottom flex-col justify-between rounded-xl p-4 shadow-[0_8px_24px_-12px_rgba(17,17,17,0.4)] transition-transform hover:z-20 hover:rotate-0 ${
              TILES[index % TILES.length]
            } ${FAN[index % FAN.length]}`}
          >
            <span aria-hidden className="text-5xl leading-none text-ink/20">
              {initial(space.name)}
            </span>
            <span>
              <span className="block truncate text-base font-medium tracking-tight">
                {space.name}
              </span>
              <span className="mt-1 block text-xs text-ink/60">{meta(space)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );

  if (spaces.length === 0) return track;

  const pair = (
    <div className="flex gap-2">
      {previous}
      {next}
    </div>
  );

  return (
    <>
      {controls === "above" && <div className="mt-2 flex justify-end">{pair}</div>}

      {controls === "labelled" && (
        <div className="mt-2 flex items-center justify-between">
          <span className="label">Spaces</span>
          {pair}
        </div>
      )}

      {controls === "above-centre" && <div className="mt-2 flex justify-center">{pair}</div>}

      {controls === "overlay" || controls === "split" ? (
        <div className="relative">
          {track}
          {controls === "overlay" ? (
            <div className="absolute top-1/2 right-0 z-30 -translate-y-1/2">{pair}</div>
          ) : (
            <>
              <div className="absolute top-1/2 left-0 z-30 -translate-y-1/2">{previous}</div>
              <div className="absolute top-1/2 right-0 z-30 -translate-y-1/2">{next}</div>
            </>
          )}
        </div>
      ) : (
        track
      )}

      {(controls === "below" || controls === "below-centre") && (
        <div
          className={`mt-2 flex ${controls === "below" ? "justify-end" : "justify-center"}`}
        >
          {pair}
        </div>
      )}
    </>
  );
}
