"use client";

/**
 * Magnetism outside the editor.
 *
 * The canvas has a drag to attach to. Everywhere else the object is the
 * pointer itself, and the same idea applies: a row or a card draws itself
 * towards the thing the pointer is near, rather than waiting to be clicked.
 *
 * That is done with a custom property rather than JavaScript per element. One
 * listener on the document writes `--near` — the distance from the pointer to
 * the nearest edge of the element under it, 0 at the edge and 1 when the
 * pointer is `REACH` away — and one rule turns it into a lift and a mint
 * edge. No measurement, no re-render, and it costs nothing when the pointer is
 * not near anything.
 *
 * Every rule here is opt-in through a `data-magnetic` attribute, so a card only
 * behaves this way where it is asked to, and `prefers-reduced-motion` turns the
 * movement off without turning the highlight off.
 */

import { useEffect } from "react";

/** How far from an edge the pointer still counts as near, in pixels. */
export const REACH = 72;

/**
 * Nearest edge, as a fraction: 0 at the element's edge, 1 at `REACH` away.
 * Written to `--near` on whatever the pointer is over.
 */
export function nearness(distance: number, reach = REACH): number {
  return Math.max(0, Math.min(1, distance / reach));
}

/** The name of the custom property the rules in `globals.css` read. */
const PROPERTY = "--near";
/** Far enough away to count as not near at all. */
const AWAY = "1";

export function Attraction() {
  useEffect(() => {
    // The last element lifted, so it can be let go again: a custom property
    // written once stays written, and without this a row would stay lifted
    // for good after the pointer had gone.
    let last: HTMLElement | null = null;

    const onMove = (event: PointerEvent) => {
      const element = (event.target as Element | null)?.closest?.("[data-magnetic]") as
        | HTMLElement
        | null;

      if (!element) {
        last?.style.setProperty(PROPERTY, AWAY);
        last = null;
        return;
      }

      const { left, right, top, bottom } = element.getBoundingClientRect();
      const x = Math.max(left - event.clientX, 0, event.clientX - right);
      const y = Math.max(top - event.clientY, 0, event.clientY - bottom);

      element.style.setProperty(PROPERTY, String(nearness(Math.hypot(x, y))));
      last = element;
    };

    document.addEventListener("pointermove", onMove, { passive: true });
    return () => document.removeEventListener("pointermove", onMove);
  }, []);

  return null;
}