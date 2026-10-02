import { describe, expect, it } from "vitest";
import {
  GUTTERS,
  THRESHOLD,
  equalSpacing,
  linesFrom,
  magnet,
  nearestGutter,
  snapAxis,
  type Box,
} from "./magnetic";

/** A box at a known place, with a known size. */
const box = (left: number, top: number, width = 100, height = 40): Box => ({
  left,
  top,
  width,
  height,
});

describe("snapAxis", () => {
  it("pulls the near edge onto a line inside the threshold", () => {
    const snap = snapAxis(box(100, 100), "x", [{ at: 97, from: 0, to: 400 }]);
    expect(snap).toEqual({ axis: "x", delta: -3, at: 97, matched: 97 });
  });

  it("leaves the box alone when every line is further than the threshold", () => {
    expect(snapAxis(box(100, 100), "x", [{ at: 107, from: 0, to: 400 }])).toBeNull();
  });

  it("snaps on the trailing edge when that is the edge leading the drag", () => {
    // A box 100…200 dragged up: its bottom edge meets the line at 203.
    const snap = snapAxis(box(100, 100, 100, 100), "y", [{ at: 203, from: 0, to: 400 }], -1);
    expect(snap).toEqual({ axis: "y", delta: 3, at: 203, matched: 203 });
  });

  it("takes the closest of several lines, not the first", () => {
    const snap = snapAxis(box(100, 100), "y", [
      { at: 95, from: 0, to: 50 },
      { at: 103, from: 0, to: 50 },
    ]);
    expect(snap?.at).toBe(103);
  });
});

describe("magnet", () => {
  it("pulls a near edge onto the centre of the column it is dropped in", () => {
    // The page column is 736 wide inside 900, so its centre sits at 82 + 368
    // = 450; a 100 wide box centred there has its left edge on 400.
    const lines = linesFrom([box(82, 0, 736, 600)]);
    expect(magnet(box(402, 240), lines)).toMatchObject({ dx: -2, dy: 0 });
  });

  it("holds the box still once a line is further than the threshold", () => {
    const lines = linesFrom([box(82, 0, 736, 600)]);
    // Left edge on 408 is 8 from the centre: too far, so the hand keeps it.
    expect(magnet(box(408, 240), lines).dx).toBe(0);
  });

  it("moves nothing when nothing is within reach", () => {
    const lines = linesFrom([box(0, 0, 800, 600)]);
    expect(magnet(box(301, 240), lines)).toMatchObject({ dx: 0, dy: 0 });
  });

  it("measures both axes from one box, so a corner can meet a corner", () => {
    const lines = linesFrom([box(400, 300, 200, 100)]);
    // The dragged box's top left corner sits 3px past the other's, and pulls
    // back to meet it: 3 left, 3 down.
    expect(magnet(box(403, 297), lines)).toMatchObject({ dx: -3, dy: 3 });
  });

  it("ignores a centre line when an edge is nearer", () => {
    // Left edge 8 from the edge at 400 and 42 from the centre at 450: the edge
    // wins, and the box is not dragged halfway across to be centred.
    const lines = linesFrom([box(400, 300, 200, 100)]);
    expect(magnet(box(408, 500), lines).dx).toBe(0);
  });

  it("never snaps the trailing edge, which would pull a box out of the hand", () => {
    const lines = linesFrom([box(400, 300, 200, 100)]);
    // Left edge 297 is 3 short of 300, but the far edge sits on 397, which is
    // 3 from 400: the trailing edge is not a candidate.
    expect(magnet(box(297, 297), lines).dx).toBe(0);
  });
});

describe("equalSpacing", () => {
  const above = box(0, 0, 100, 100);
  const below = box(0, 300, 100, 100);

  it("centres the gap when the two sides are close to equal", () => {
    // 85 above, 75 below: the box is pulled 5px up, which evens them at 80.
    expect(equalSpacing(box(0, 185), above, below)).toBe(-5);
  });

  it("leaves a lopsided gap to the hand", () => {
    expect(equalSpacing(box(0, 150), above, below)).toBe(0);
  });

  it("yields to an edge, since both act on the same movement", () => {
    // 90 above, 170 below: the pull would be 40px, far past the threshold,
    // so the edges own this position instead.
    expect(equalSpacing(box(0, 190), above, box(0, 420, 100, 100))).toBe(0);
  });

  it("needs both neighbours, since one gap has nothing to match", () => {
    expect(equalSpacing(box(0, 195), above, box(0, 0, 100, 0))).toBe(0);
  });
});

describe("nearestGutter", () => {
  it("rounds a gap onto the spacing scale", () => {
    expect(nearestGutter(22)).toBe(24);
    expect(nearestGutter(37)).toBe(40);
  });

  it("keeps the design system's own steps, smallest to largest", () => {
    expect([...GUTTERS]).toEqual([8, 16, 24, 40, 64]);
  });

  it("has a threshold a snap cannot outrun", () => {
    // The snap only fires inside 6px, so the scale's own 8px step is wider
    // than a snap and can never fight it.
    expect(GUTTERS[0]).toBeGreaterThan(THRESHOLD);
  });
});

describe("linesFrom", () => {
  it("offers each box's edges and its centre, on both axes", () => {
    expect(linesFrom([box(100, 100, 200, 50)])).toEqual({
      x: [
        { at: 100, from: 100, to: 300 },
        { at: 200, from: 100, to: 300, centre: true },
        { at: 300, from: 100, to: 300 },
      ],
      y: [
        { at: 100, from: 100, to: 150 },
        { at: 125, from: 100, to: 150, centre: true },
        { at: 150, from: 100, to: 150 },
      ],
    });
  });

  it("skips a collapsed box, which has no lines to offer", () => {
    expect(linesFrom([box(0, 0, 0, 40)])).toEqual({ x: [], y: [] });
  });
});