"use client";

import { useEffect, useState } from "react";
import type { Space } from "@/db";
import { SpaceRail } from "./space-rail";

/**
 * Four readings of the vertical space above the deck, from nearly flush to what
 * ships today. A design exploration: once one wins, inline it in `page.tsx`,
 * fold the winning strings into `space-rail.tsx`, and delete this file.
 */
const SPACING = [
  { name: "Tightest", section: "mt-2", controls: "mt-2", rail: "mt-2 pt-4 pb-1" },
  { name: "Tight", section: "mt-4", controls: "mt-3", rail: "mt-2 pt-5 pb-2" },
  { name: "Compact", section: "mt-6", controls: "mt-3", rail: "mt-3 pt-6 pb-3" },
  { name: "Current", section: "mt-10", controls: "mt-4", rail: "mt-3 pt-8 pb-4" },
];

export function SpacesSection({ spaces }: { spaces: Space[] }) {
  const [active, setActive] = useState(SPACING.length - 1);
  const spacing = SPACING[active];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable=true]")) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const index = Number(event.key) - 1;
      if (index >= 0 && index < SPACING.length) setActive(index);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <section className={spacing.section}>
        {spaces.length === 0 ? (
          <p className="mt-5 rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-smoke">
            No spaces yet. Create one above to start adding pages and components.
          </p>
        ) : (
          <SpaceRail
            spaces={spaces}
            controlsClass={spacing.controls}
            railClass={spacing.rail}
          />
        )}
      </section>

      <div className="fixed right-6 bottom-6 z-50 flex items-center gap-2 rounded-full border border-line bg-card/90 p-1.5 pl-3 shadow-lg backdrop-blur">
        <span className="font-primary text-xs text-smoke">
          {active + 1}. {spacing.name}
        </span>
        <div className="flex gap-0.5">
          {SPACING.map((variant, i) => (
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
