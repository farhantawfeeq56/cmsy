"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import type { Space } from "@/db";

/**
 * Ten variations on the fanned-deck space row, behind a dev-only picker at the
 * bottom right (keys 1-9 then 0). A design exploration, not a shipped feature:
 * when one wins, inline it in `page.tsx` and delete this file.
 */
const TILES = ["bg-mint", "bg-butter", "bg-lilac"];

const initial = (value: string) => value.trim().charAt(0).toUpperCase() || "?";

/** Fixed class lists rather than inline styles, so Tailwind can see them. */
const FAN = ["-rotate-3", "-rotate-2", "rotate-0", "rotate-2", "rotate-3"];
const DEPTH = ["scale-100", "scale-[0.94]", "scale-[0.88]", "scale-[0.82]", "scale-[0.76]"];

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

const card = (space: Space, i: number, className = "") =>
  `font-primary flex flex-col justify-end rounded-xl p-4 shadow-[0_8px_24px_-12px_rgba(17,17,17,0.4)] transition-transform ${
    TILES[i % TILES.length]
  } ${className}`;

/** One li per space; every variant supplies only the card inside it. */
const track = (
  spaces: Space[],
  slide: (space: Space, index: number) => ReactNode,
  {
    railRef,
    className = "",
    slideClass,
  }: {
    railRef: RailRef;
    className?: string;
    slideClass?: (index: number) => string;
  },
) => (
  <ul
    ref={railRef}
    className={`-mx-6 mt-3 flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 pt-4 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
  >
    {spaces.map((space, index) => (
      <li
        key={space.id}
        className={`relative shrink-0 snap-start scroll-ml-4 ${slideClass?.(index) ?? ""}`}
      >
        {slide(space, index)}
      </li>
    ))}
  </ul>
);

const deck = (spaces: Space[], railRef: RailRef) =>
  track(
    spaces,
    (space, i) => (
      <Link
        href={`/dashboard/${space.slug}`}
        className={card(space, i, "h-60 w-48 hover:-translate-y-2 hover:z-10")}
      >
        <span className="block truncate text-base font-medium tracking-tight">{space.name}</span>
        <span className="mt-1 text-xs text-ink/60">{meta(space)}</span>
      </Link>
    ),
    { railRef, slideClass: (i) => (i > 0 ? "-ml-14" : "") },
  );

const tight = (spaces: Space[], railRef: RailRef) =>
  track(
    spaces,
    (space, i) => (
      <Link
        href={`/dashboard/${space.slug}`}
        className={card(space, i, "h-56 w-44 hover:-translate-y-2 hover:z-20")}
      >
        <span className="block truncate text-sm font-medium">{space.name}</span>
        <span className="mt-1 block truncate text-xs text-ink/50">{meta(space)}</span>
      </Link>
    ),
    { railRef, slideClass: (i) => (i > 0 ? "-ml-28" : "") },
  );

const wide = (spaces: Space[], railRef: RailRef) =>
  track(
    spaces,
    (space, i) => (
      <Link
        href={`/dashboard/${space.slug}`}
        className={card(space, i, "h-44 w-80 justify-between hover:-translate-y-2 hover:z-10")}
      >
        <span className="block truncate text-lg font-medium tracking-tight">{space.name}</span>
        <span>
          <span className="block text-xs text-ink/60">{meta(space)}</span>
          <span className="mt-1 block text-xs text-ink/40">/{space.slug}</span>
        </span>
      </Link>
    ),
    { railRef, slideClass: (i) => (i > 0 ? "-ml-24" : "") },
  );

const tall = (spaces: Space[], railRef: RailRef) =>
  track(
    spaces,
    (space, i) => (
      <Link
        href={`/dashboard/${space.slug}`}
        className={card(space, i, "h-80 w-36 items-center justify-center hover:-translate-y-2")}
      >
        <span className="truncate text-sm font-medium [writing-mode:vertical-rl]">{space.name}</span>
        <span className="mt-3 text-[0.625rem] text-ink/50 [writing-mode:vertical-rl]">
          {space.page_count}p {space.component_count}c
        </span>
      </Link>
    ),
    { railRef, slideClass: (i) => (i > 0 ? "-ml-10" : "") },
  );

const fannedMarks = (spaces: Space[], railRef: RailRef) =>
  track(
    spaces,
    (space, i) => (
      <Link
        href={`/dashboard/${space.slug}`}
        className={card(
          space,
          i,
          `h-60 w-52 origin-bottom justify-between hover:z-20 hover:rotate-0 ${FAN[i % FAN.length]}`,
        )}
      >
        <span aria-hidden className="font-primary text-5xl leading-none text-ink/20">
          {initial(space.name)}
        </span>
        <span>
          <span className="block truncate text-base font-medium">{space.name}</span>
          <span className="mt-1 block text-xs text-ink/60">{meta(space)}</span>
        </span>
      </Link>
    ),
    { railRef, className: "items-end pt-8", slideClass: (i) => (i > 0 ? "-ml-12" : "") },
  );

const spines = (spaces: Space[], railRef: RailRef) =>
  track(
    spaces,
    (space) => (
      <Link
        href={`/dashboard/${space.slug}`}
        className="flex h-56 w-60 overflow-hidden rounded-xl border border-line bg-card transition-transform hover:-translate-y-2 hover:z-20"
      >
        <span className="flex w-16 shrink-0 items-center justify-center bg-ink p-3">
          <span className="font-primary truncate text-xs font-medium text-white [writing-mode:vertical-rl]">
            {space.name}
          </span>
        </span>
        <span className="flex min-w-0 flex-col justify-end p-4">
          <span className="font-primary block truncate text-base font-medium">{space.name}</span>
          <span className="mt-1 block text-xs text-smoke">{meta(space)}</span>
          <span className="mt-3 block truncate text-xs text-smoke">/{space.slug}</span>
        </span>
      </Link>
    ),
    { railRef, slideClass: (i) => (i > 0 ? "-ml-44" : "") },
  );

const staggered = (spaces: Space[], railRef: RailRef) =>
  track(
    spaces,
    (space, i) => (
      <Link
        href={`/dashboard/${space.slug}`}
        className={card(space, i, "h-52 w-44 hover:-translate-y-2")}
      >
        <span className="block truncate text-base font-medium">{space.name}</span>
        <span className="mt-1 block text-xs text-ink/60">{meta(space)}</span>
      </Link>
    ),
    { railRef, className: "items-start pt-6 pb-8", slideClass: (i) => (i % 2 ? "translate-y-6" : "") },
  );

const fanned = (spaces: Space[], railRef: RailRef) =>
  track(
    spaces,
    (space, i) => (
      <Link
        href={`/dashboard/${space.slug}`}
        className={card(
          space,
          i,
          `h-56 w-44 origin-bottom hover:z-20 hover:rotate-0 ${FAN[i % FAN.length]}`,
        )}
      >
        <span className="block truncate text-base font-medium">{space.name}</span>
        <span className="mt-1 block text-xs text-ink/60">{meta(space)}</span>
      </Link>
    ),
    { railRef, className: "items-end pt-8", slideClass: (i) => (i > 0 ? "-ml-12" : "") },
  );

const receding = (spaces: Space[], railRef: RailRef) =>
  track(
    spaces,
    (space, i) => (
      <Link
        href={`/dashboard/${space.slug}`}
        className={card(
          space,
          i,
          `h-60 w-52 origin-left hover:z-20 hover:scale-100 ${DEPTH[Math.min(i, DEPTH.length - 1)]}`,
        )}
      >
        <span className="block truncate text-base font-medium">{space.name}</span>
        <span className="mt-1 block text-xs text-ink/60">{meta(space)}</span>
      </Link>
    ),
    { railRef, className: "items-center", slideClass: (i) => (i > 0 ? "-ml-16" : "") },
  );

const spread = (spaces: Space[], railRef: RailRef) =>
  track(
    spaces,
    (space, i) => (
      <Link
        href={`/dashboard/${space.slug}`}
        className={card(space, i, "h-56 w-48 hover:-translate-y-2")}
      >
        <span className="block truncate text-base font-medium">{space.name}</span>
        <span className="mt-1 block text-xs text-ink/60">{meta(space)}</span>
      </Link>
    ),
    { railRef, slideClass: (i) => (i > 0 ? "-ml-20 hover:ml-0 hover:z-20" : "") },
  );

const VARIANTS: { name: string; view: (spaces: Space[], railRef: RailRef) => ReactNode }[] = [
  { name: "Deck", view: deck },
  { name: "Tight overlap", view: tight },
  { name: "Landscape deck", view: wide },
  { name: "Tall spines", view: tall },
  { name: "Fanned marks", view: fannedMarks },
  { name: "Colour spines", view: spines },
  { name: "Staggered", view: staggered },
  { name: "Fanned", view: fanned },
  { name: "Receding", view: receding },
  { name: "Spread on hover", view: spread },
];

/** Names for the mock rows, so a long list reads like a real account. */
const MOCK_NAMES = [
  "Marketing site",
  "Product docs",
  "Design system",
  "Onboarding",
  "Blog",
  "Help center",
  "Mobile app",
  "Brand kit",
  "Changelog",
  "Email templates",
  "Sales deck",
  "API reference",
];

/**
 * The real spaces, padded with mocks up to `count` so the layout can be judged
 * at any list length. Mock rows borrow a real slug, so every link still lands.
 */
function sample(spaces: Space[], count: number): Space[] {
  const shown: Space[] = [];

  for (let i = 0; i < count; i += 1) {
    const real = spaces[i % spaces.length];
    if (!real) break;

    shown.push(
      i < spaces.length
        ? real
        : {
            ...real,
            id: `mock-${i}`,
            name: MOCK_NAMES[i % MOCK_NAMES.length],
            page_count: (i * 3) % 17,
            component_count: (i * 2) % 9,
            updated_at: new Date(Date.now() - i * 7 * 60 * 60 * 1000).toISOString(),
          },
    );
  }

  return shown;
}

export function SpaceList({ spaces }: { spaces: Space[] }) {
  const [active, setActive] = useState(0);
  const [count, setCount] = useState(spaces.length);
  const railRef = useRef<HTMLUListElement>(null);
  const shown = useMemo(() => sample(spaces, count), [spaces, count]);
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
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable=true]")) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        nudge(event.key === "ArrowLeft" ? -1 : 1);
        return;
      }

      if (event.key.length !== 1) return;

      const digit = Number(event.key);
      if (!Number.isInteger(digit)) return;

      const next = digit === 0 ? 9 : digit - 1;
      if (next < VARIANTS.length) setActive(next);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nudge]);

  return (
    <>
      {shown.length > 0 && (
        <div className="mt-4 flex items-center justify-end gap-2">
          <NavButton label="Previous spaces" disabled={!edges.prev} onClick={() => nudge(-1)}>
            ‹
          </NavButton>
          <NavButton label="Next spaces" disabled={!edges.next} onClick={() => nudge(1)}>
            ›
          </NavButton>
        </div>
      )}

      {VARIANTS[active].view(shown, railRef)}

      <div className="fixed right-6 bottom-6 z-50 flex flex-col items-end gap-2">
        <label className="flex items-center gap-2 rounded-full border border-line bg-card/90 px-3 py-1.5 text-xs text-smoke shadow-lg backdrop-blur">
          Spaces
          <input
            type="range"
            min={0}
            max={24}
            value={count}
            onChange={(event) => setCount(Number(event.target.value))}
            className="h-1 w-32 accent-[var(--color-ink)]"
          />
          <span className="w-4 text-right font-medium tabular-nums text-ink">{count}</span>
        </label>

        <div className="flex items-center gap-2 rounded-full border border-line bg-card/90 p-1.5 pl-3 shadow-lg backdrop-blur">
          <span className="font-primary text-xs text-smoke">
            {active + 1}. {VARIANTS[active].name}
          </span>
          <div className="flex gap-0.5">
            {VARIANTS.map((variant, i) => (
              <button
                key={variant.name}
                type="button"
                title={`${i + 1}. ${variant.name}`}
                aria-pressed={i === active}
                onClick={() => setActive(i)}
                className={`flex size-7 items-center justify-center rounded-full text-xs tabular-nums transition-colors ${
                  i === active ? "bg-ink text-white" : "text-smoke hover:bg-ink/[0.06]"
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
