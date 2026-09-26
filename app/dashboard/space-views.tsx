"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import type { Space } from "@/db";

/**
 * Ten variations on the fanned-deck space row, behind a dev-only picker at the
 * bottom right (keys 1-9 then 0). A design exploration, not a shipped feature:
 * when one wins, inline it in `page.tsx` and delete this file.
 */
const TILES = ["bg-mint", "bg-butter", "bg-lilac"];

const meta = (space: Space) =>
  `${space.page_count} ${space.page_count === 1 ? "page" : "pages"} · ${space.component_count} ${
    space.component_count === 1 ? "component" : "components"
  }`;

const card = (space: Space, i: number, className = "") =>
  `font-primary flex flex-col justify-end rounded-xl p-4 shadow-[0_8px_24px_-12px_rgba(17,17,17,0.4)] transition-transform ${
    TILES[i % TILES.length]
  } ${className}`;

/** One li per space; every variant supplies only the card inside it. */
const track = (
  spaces: Space[],
  slide: (space: Space, index: number) => ReactNode,
  { className = "", slideClass }: { className?: string; slideClass?: (index: number) => string } = {},
) => (
  <ul
    className={`-mx-6 mt-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 pt-4 pb-4 ${className}`}
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

const deck = (spaces: Space[]) =>
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
    { slideClass: (i) => (i > 0 ? "-ml-14" : "") },
  );

const tight = (spaces: Space[]) =>
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
    { slideClass: (i) => (i > 0 ? "-ml-28" : "") },
  );

const wide = (spaces: Space[]) =>
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
    { slideClass: (i) => (i > 0 ? "-ml-24" : "") },
  );

const tall = (spaces: Space[]) =>
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
    { slideClass: (i) => (i > 0 ? "-ml-10" : "") },
  );

const numbered = (spaces: Space[]) =>
  track(
    spaces,
    (space, i) => (
      <Link
        href={`/dashboard/${space.slug}`}
        className={card(space, i, "h-60 w-52 justify-between hover:-translate-y-2 hover:z-10")}
      >
        <span className="text-4xl tracking-[-0.04em] text-ink/25">
          {String(i + 1).padStart(2, "0")}
        </span>
        <span>
          <span className="block truncate text-base font-medium">{space.name}</span>
          <span className="mt-1 block text-xs text-ink/60">{meta(space)}</span>
        </span>
      </Link>
    ),
    { slideClass: (i) => (i > 0 ? "-ml-16" : "") },
  );

const spines = (spaces: Space[]) =>
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
    { slideClass: (i) => (i > 0 ? "-ml-44" : "") },
  );

const staggered = (spaces: Space[]) =>
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
    { className: "items-start pt-6 pb-8", slideClass: (i) => (i % 2 ? "translate-y-6" : "") },
  );

const FAN = ["-rotate-3", "-rotate-2", "rotate-0", "rotate-2", "rotate-3"];
const DEPTH = ["scale-100", "scale-[0.94]", "scale-[0.88]", "scale-[0.82]", "scale-[0.76]"];

const fanned = (spaces: Space[]) =>
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
    { className: "items-end pt-8", slideClass: (i) => (i > 0 ? "-ml-12" : "") },
  );

const receding = (spaces: Space[]) =>
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
    { className: "items-center", slideClass: (i) => (i > 0 ? "-ml-16" : "") },
  );

const spread = (spaces: Space[]) =>
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
    { slideClass: (i) => (i > 0 ? "-ml-20 hover:ml-0 hover:z-20" : "") },
  );

const VARIANTS: { name: string; view: (spaces: Space[]) => ReactNode }[] = [
  { name: "Deck", view: deck },
  { name: "Tight overlap", view: tight },
  { name: "Landscape deck", view: wide },
  { name: "Tall spines", view: tall },
  { name: "Numbered deck", view: numbered },
  { name: "Colour spines", view: spines },
  { name: "Staggered", view: staggered },
  { name: "Fanned", view: fanned },
  { name: "Receding", view: receding },
  { name: "Spread on hover", view: spread },
];

export function SpaceList({ spaces }: { spaces: Space[] }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable=true]")) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.length !== 1) return;

      const digit = Number(event.key);
      if (!Number.isInteger(digit)) return;

      const next = digit === 0 ? 9 : digit - 1;
      if (next < VARIANTS.length) setActive(next);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      {VARIANTS[active].view(spaces)}

      <div className="fixed right-6 bottom-6 z-50 flex items-center gap-2 rounded-full border border-line bg-card/90 p-1.5 pl-3 shadow-lg backdrop-blur">
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
    </>
  );
}
