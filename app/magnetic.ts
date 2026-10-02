/**
 * Where things attract, as pure arithmetic.
 *
 * Every magnetic behaviour in the app is this file plus a way of reading the
 * boxes involved: given the thing being moved and the lines worth lining up
 * with, say how far to move it and which guides to draw. No DOM and no React,
 * so it runs in Node and is tested like the rest of the store (see
 * `magnetic.test.ts`).
 *
 * Two kinds of candidate, and the difference between them is the whole of it:
 *
 * - **Edges.** The box's leading edge onto another box's edge. This is what
 *   lines up a list of siblings, and what holds a box against a container's
 *   edge.
 * - **Centres.** The box's centre onto another box's centre. This is what
 *   centres a component in a section, and no edge can express it: a 100 wide
 *   box centred on a column 736 wide is 50px from that column's centre line,
 *   far outside any threshold that would leave the hand in charge.
 *
 * Either way only the near edge and the centre of the dragged box are
 * candidates, never its trailing edge, and each axis is decided on its own —
 * so a box held on a column's centre stays free to move vertically and the
 * magnetism never takes the drag away.
 */

/** Under one grid step, so a snap lands before the hand notices it happening. */
export const THRESHOLD = 6;

/**
 * The spacing scale in DESIGN.md, which the CSS custom properties of the same
 * name in `app/globals.css` repeat, so a guide the editor snaps to and a lift
 * outside it come from one rhythm rather than two.
 */
export const GUTTERS = [8, 16, 24, 40, 64] as const;

export type Box = { left: number; top: number; width: number; height: number };

/** A candidate: a line's position, how far it reaches, and whether it is a centre. */
export type Line = { at: number; from: number; to: number; centre?: boolean };

export type Axis = "x" | "y";

/** Candidates per axis, which is how a caller reads them: x is width's. */
export type Lines = { x: Line[]; y: Line[] };

/**
 * One snap: how far to move, where the box's near edge ends up, and the line it
 * met. `axis` is which one it was, so a caller can report it without keeping
 * the result of two separate calls side by side.
 */
export type Snap = { axis: Axis; delta: number; at: number; matched: number };

const start = (box: Box, axis: Axis) => (axis === "x" ? box.left : box.top);
const size = (box: Box, axis: Axis) => (axis === "x" ? box.width : box.height);
const stop = (box: Box, axis: Axis) => start(box, axis) + size(box, axis);

/**
 * The nearest line to the box's leading edge or its centre, or null if none is
 * close enough. Whichever is nearer wins, so a box does not jump further to
 * reach a centre when an edge is right there.
 *
 * `leading` is the direction of travel: a box dragged down snaps with its top
 * edge, one dragged up with its bottom, so the edge that leads is the one that
 * meets the line.
 */
export function snapAxis(
  box: Box,
  axis: Axis,
  lines: Line[],
  leading: -1 | 0 | 1 = 0,
  threshold = THRESHOLD,
): Snap | null {
  const a = leading === -1 ? stop(box, axis) : start(box, axis);
  const c = a + size(box, axis) / 2;
  let best: Snap | null = null;

  for (const line of lines) {
    const delta = line.at - (line.centre ? c : a);
    if (Math.abs(delta) > threshold) continue;
    if (!best || Math.abs(delta) < Math.abs(best.delta)) {
      best = { axis, delta, at: a + delta, matched: line.at };
    }
  }

  return best;
}

/**
 * Two per-axis results: the snap that holds, and the other axis's free travel.
 * An axis with no line near enough comes back null, which is what leaves it to
 * the hand.
 */
export function magnet(
  box: Box,
  lines: Lines,
  threshold = THRESHOLD,
): { x: Snap | null; y: Snap | null; dx: number; dy: number } {
  const x = snapAxis(box, "x", lines.x, 0, threshold);
  const y = snapAxis(box, "y", lines.y, 0, threshold);

  return { x, y, dx: x?.delta ?? 0, dy: y?.delta ?? 0 };
}

/**
 * Where a box belongs between two neighbours, when the two gaps round to the
 * same number of pixels. Dragging a sibling between two others should feel
 * like it is sitting in a slot, so the box is pulled to the position where the
 * space above and below it matches.
 *
 * The gaps are measured to the boxes' outer edges, so this is about the space
 * between things rather than the space inside them.
 *
 * ponytail: measured but not yet wired in — a drag between two siblings has to
 * know which zone it is passing through, and this editor's canvas is one flat
 * column. Wire it when a zone can be identified while dragging; until then it
 * is tested but unused.
 */
export function equalSpacing(box: Box, above: Box, below: Box, threshold = THRESHOLD): number {
  const gapAbove = box.top - above.top - above.height;
  const gapBelow = below.top - (box.top + box.height);
  const shift = (gapBelow - gapAbove) / 2;

  return Math.abs(shift) <= threshold ? shift : 0;
}

/**
 * The nearest point on the spacing scale to a gap — the difference between a
 * slide that looks deliberate and one that looks accidental.
 */
export function nearestGutter(gap: number, gutters: readonly number[] = GUTTERS): number {
  let best = gap;
  let distance = Infinity;

  for (const gutter of gutters) {
    const to = Math.abs(gutter - gap);
    if (to < distance) {
      distance = to;
      best = gutter;
    }
  }

  return best;
}

/**
 * A box's lines to snap to, gathered from the boxes around it: their near
 * edges, their far edges and their centres. This is the only place that knows
 * what counts as a candidate — everything else consumes these lines.
 *
 * A container counts as a candidate too, which is what makes a component feel
 * attracted to the section it is dropped into rather than only to its
 * siblings.
 */
export function linesFrom(boxes: Box[]): Lines {
  const lines: Lines = { x: [], y: [] };

  for (const box of boxes) {
    if (box.width <= 0 || box.height <= 0) continue;

    for (const axis of ["x", "y"] as const) {
      const from = start(box, axis);
      const to = stop(box, axis);
      lines[axis].push(
        { at: from, from, to },
        { at: (from + to) / 2, from, to, centre: true },
        { at: to, from, to },
      );
    }
  }

  return lines;
}