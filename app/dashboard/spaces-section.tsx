"use client";

import { useEffect, useState } from "react";
import type { Space } from "@/db";
import { SpaceRail } from "./space-rail";

/**
 * Six looseness settings for the deck, from the fan that ships today to a plain
 * row. A design exploration: once one wins, fold the class into `space-rail.tsx`
 * and delete this file.
 */
const LOOSENESS = [
  { name: "Overlap 32", overlap: "-ml-8" },
  { name: "Overlap 24", overlap: "-ml-6" },
  { name: "Overlap 16", overlap: "-ml-4" },
  { name: "Overlap 8", overlap: "-ml-2" },
  { name: "Row, gap 4", overlap: "" },
  { name: "Row, gap 6", overlap: "", gap: "gap-6" },
];

export function SpacesSection({ spaces }: { spaces: Space[] }) {
  const [active, setActive] = useState(0);
  const looseness = LOOSENESS[active];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable=true]")) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const index = Number(event.key) - 1;
      if (index >= 0 && index < LOOSENESS.length) setActive(index);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <section className="mt-2">
        {spaces.length === 0 ? (
          <p className="mt-5 rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-smoke">
            No spaces yet. Create one above to start adding pages and components.
          </p>
        ) : (
          <SpaceRail
            spaces={spaces}
            overlapClass={looseness.overlap}
            gapClass={looseness.gap}
          />
        )}
      </section>

      <div className="fixed right-6 bottom-6 z-50 flex items-center gap-2 rounded-full border border-line bg-card/90 p-1.5 pl-3 shadow-lg backdrop-blur">
        <span className="font-primary text-xs text-smoke">
          {active + 1}. {looseness.name}
        </span>
        <div className="flex gap-0.5">
          {LOOSENESS.map((variant, i) => (
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
