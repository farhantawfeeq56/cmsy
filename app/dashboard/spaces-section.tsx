"use client";

import { useEffect, useState } from "react";
import type { Space } from "@/db";
import { SpaceRail } from "./space-rail";

/**
 * Two variants of the dashboard's spaces section: as it is, and with the whole
 * section gone (the sidebar still lists every space, so nothing is stranded).
 * A design exploration: once one wins, inline it in `page.tsx` and delete this.
 */
const VARIANTS = ["With spaces", "Without spaces"];

export function SpacesSection({ spaces }: { spaces: Space[] }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable=true]")) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const index = Number(event.key) - 1;
      if (index >= 0 && index < VARIANTS.length) setActive(index);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      {active === 0 && (
        <section className="mt-10">
          {spaces.length === 0 ? (
            <p className="mt-5 rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-smoke">
              No spaces yet. Create one above to start adding pages and components.
            </p>
          ) : (
            <SpaceRail spaces={spaces} />
          )}
        </section>
      )}

      <div className="fixed right-6 bottom-6 z-50 flex items-center gap-2 rounded-full border border-line bg-card/90 p-1.5 pl-3 shadow-lg backdrop-blur">
        <span className="font-primary text-xs text-smoke">
          {active + 1}. {VARIANTS[active]}
        </span>
        <div className="flex gap-0.5">
          {VARIANTS.map((variant, i) => (
            <button
              key={variant}
              type="button"
              title={`${i + 1}. ${variant}`}
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
