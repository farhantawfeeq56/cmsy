"use client";

import { useEffect, useState } from "react";
import type { Space } from "@/db";
import { SpaceRail, type RailControls } from "./space-rail";

/**
 * Seven places the rail's prev/next controls could live, with the tightest
 * spacing of the four that were compared. A design exploration: once one wins,
 * inline it in `page.tsx`, fold it into `space-rail.tsx`, and delete this file.
 */
const PLACEMENTS: { name: string; controls: RailControls }[] = [
  { name: "Above", controls: "above" },
  { name: "Above, labelled", controls: "labelled" },
  { name: "Above, centred", controls: "above-centre" },
  { name: "Overlay", controls: "overlay" },
  { name: "Split sides", controls: "split" },
  { name: "Below", controls: "below" },
  { name: "Below, centred", controls: "below-centre" },
];

export function SpacesSection({ spaces }: { spaces: Space[] }) {
  const [active, setActive] = useState(0);
  const placement = PLACEMENTS[active];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable=true]")) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const index = Number(event.key) - 1;
      if (index >= 0 && index < PLACEMENTS.length) setActive(index);
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
          <SpaceRail spaces={spaces} controls={placement.controls} />
        )}
      </section>

      <div className="fixed right-6 bottom-6 z-50 flex items-center gap-2 rounded-full border border-line bg-card/90 p-1.5 pl-3 shadow-lg backdrop-blur">
        <span className="font-primary text-xs text-smoke">
          {active + 1}. {placement.name}
        </span>
        <div className="flex gap-0.5">
          {PLACEMENTS.map((variant, i) => (
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
