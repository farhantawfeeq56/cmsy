"use client";

import { useEffect, useState } from "react";
import type { Space } from "@/db";
import { SpaceRail } from "./space-rail";

/**
 * Four readings of the gap between the header and the deck. The deck's own
 * `pt-4` (which clears the rotated card corners) is on top of these, so the
 * names below are the visible gap. A design exploration: once one wins, fold the
 * margin into `page.tsx` and delete this file.
 */
const GAPS = [
  { name: "Gap 24", section: "mt-2" },
  { name: "Gap 32", section: "mt-4" },
  { name: "Gap 40", section: "mt-6" },
  { name: "Gap 48", section: "mt-8" },
];

export function SpacesSection({ spaces }: { spaces: Space[] }) {
  const [active, setActive] = useState(0);
  const gap = GAPS[active];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable=true]")) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const index = Number(event.key) - 1;
      if (index >= 0 && index < GAPS.length) setActive(index);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <section className={gap.section}>
        {spaces.length === 0 ? (
          <p className="mt-5 rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-smoke">
            No spaces yet. Create one above to start adding pages and components.
          </p>
        ) : (
          <SpaceRail spaces={spaces} />
        )}
      </section>

      <div className="fixed right-6 bottom-6 z-50 flex items-center gap-2 rounded-full border border-line bg-card/90 p-1.5 pl-3 shadow-lg backdrop-blur">
        <span className="font-primary text-xs text-smoke">
          {active + 1}. {gap.name}
        </span>
        <div className="flex gap-0.5">
          {GAPS.map((variant, i) => (
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
