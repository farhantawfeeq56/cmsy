"use client";

/**
 * The magnetic editor: what a block does as it is dragged past the things
 * around it.
 *
 * Puck owns the drag, so nothing here decides where a block goes. The one
 * thing this reaches for is the drag itself, read through the drag library's
 * React copy — which the editor has nested under it, off the app's module
 * path, so it is imported by path rather than by name to get one instance of
 * it rather than two.
 *
 * Snapping happens on `dragmove`, which fires before the manager records the
 * pointer's new position. Each move is therefore measured and applied here, and
 * the manager is told where the pointer actually ended up. That ordering is
 * what makes the magnetism legible: the block does not visibly lag behind the
 * cursor and catch up, it is placed on the line on the same frame the cursor
 * arrives.
 *
 * The lines snap to come from `app/magnetic.ts`, which knows nothing about
 * Puck. This file only reads boxes out of the DOM and hands them over.
 *
 * ponytail: the boxes are read once per drag rather than per move, on the
 * assumption that a drag does not resize the page under it. Re-read on
 * `resize` and on a scroll that changes the canvas height if a block turns out
 * to reflow mid-drag.
 */

import { useEffect, useState, type ReactNode } from "react";
import { useDragOperation } from "../../../../../node_modules/@puckeditor/core/node_modules/@dnd-kit/react";
import { linesFrom, magnet, type Box } from "@/app/magnetic";

/** The lines a move was held to, in viewport pixels, for the guides to draw. */
type Guide = { axis: "x" | "y"; at: number };

const rectOf = (el: Element): Box => {
  const { left, top, width, height } = el.getBoundingClientRect();
  return { left, top, width, height };
};

/**
 * The lines worth snapping to: the reading column the block is being dropped
 * into, then every other block on the canvas.
 *
 * The column comes first because a block dropped alone in a section settles on
 * its centre, which is the one line no sibling can give it. `offsetParent` is
 * null for a hidden or detached block, and for the one being dragged out of
 * the flow, so it filters the dragged block out of its own targets.
 */
function candidates(root: Element, exclude: Element | null): Box[] {
  const boxes: Box[] = [];
  const column = root.querySelector<HTMLElement>(".doc-page");
  if (column) boxes.push(rectOf(column));

  for (const el of root.querySelectorAll<HTMLElement>("[data-puck-component]")) {
    if (el === exclude || !el.offsetParent) continue;
    boxes.push(rectOf(el));
  }

  return boxes;
}

/* ----------------------------------------------------------------- guides */

/**
 * The guides, drawn over the canvas while a drag is on.
 *
 * Fixed to the viewport, because viewport pixels are what both the boxes and
 * the snap are measured in — nothing to convert, and nothing to recalculate
 * when the page scrolls mid-drag.
 */
export function MagneticGuides({ lines }: { lines: Guide[] }) {
  if (!lines.length) return null;

  return (
    <div data-magnetic-guides="" aria-hidden className="pointer-events-none fixed inset-0 z-50">
      {lines.map((line) => (
        <div
          key={line.axis}
          data-magnetic-guide=""
          className="absolute bg-ember"
          style={
            line.axis === "x"
              ? { left: line.at, top: 0, bottom: 0, width: 1 }
              : { top: line.at, left: 0, right: 0, height: 1 }
          }
        />
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------- plugin */

/**
 * Puck's `overrides.puck` is the one override rendered inside the drag
 * provider, so this is where the drag is in reach. The layout Puck built is
 * left exactly as it was; this only listens while a block is being moved.
 */
export function MagneticPuck({ children }: { children: ReactNode }) {
  const operation = useDragOperation();
  const [guides, setGuides] = useState<Guide[]>([]);

  useEffect(() => {
    const manager = operation.source?.manager;
    if (!manager) return;

    const { dragOperation } = manager;
    /**
     * The block being dragged: which element, and where it started. The
     * starting box is the one number that makes a re-applied move land right —
     * the manager's movement is a delta from the last position it was told
     * about, not from where the pointer actually is.
     */
    const drag = { element: operation.source?.element ?? null, start: null as Box | null };

    let targets: Box[] | null = null;

    const stop = manager.monitor.addEventListener("dragstart", () => {
      const root = document.querySelector("[data-puck-entry]");
      const element = drag.element;

      targets = root && element ? candidates(root, element) : null;
      drag.start = element ? rectOf(element) : null;
    });

    const stopEnd = manager.monitor.addEventListener("dragend", () => {
      targets = null;
      drag.start = null;
      setGuides([]);
    });

    // One move: how far the pointer came, applied to where the block was, and
    // the snap folded into the movement handed back. `manager.actions.move`
    // queues that movement for after this event, so the manager's recorded
    // position and what is drawn agree and a held block cannot drift.
    const stopMove = manager.monitor.addEventListener("dragmove", ({ by }) => {
      const element = dragOperation.source?.element ?? drag.element;
      if (!element || !by || !drag.start) return;

      // dnd-kit drags a clone, so the source element's rect is where the block
      // would land rather than where the pointer currently is.
      const snap = magnet({ ...drag.start, left: drag.start.left + by.x, top: drag.start.top + by.y }, linesFrom(targets ?? []));
      const lines: Guide[] = [snap.x, snap.y].flatMap((line) =>
        line ? [{ axis: line.axis, at: line.at }] : [],
      );

      setGuides(lines);
      if (snap.dx || snap.dy) manager.actions.move({ by: { x: by.x + snap.dx, y: by.y + snap.dy } });
    });

    return () => {
      stop();
      stopEnd();
      stopMove();
    };
  }, [operation.source]);

  return (
    <>
      <MagneticGuides lines={guides} />
      {children}
    </>
  );
}