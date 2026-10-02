import { describe, expect, it } from "vitest";
import { REACH, nearness } from "./attraction";

describe("nearness", () => {
  it("is 0 at the edge the pointer is on", () => {
    expect(nearness(0)).toBe(0);
  });

  it("is 1 once the pointer is out of reach, and never more", () => {
    expect(nearness(REACH)).toBe(1);
    expect(nearness(REACH * 4)).toBe(1);
  });

  it("rises evenly in between, so the lift eases rather than snaps", () => {
    expect(nearness(REACH / 2)).toBeCloseTo(0.5);
  });

  it("reads as fully near when the pointer is inside the element", () => {
    // The distance is measured to the nearest edge from outside, so a pointer
    // over the element itself has nowhere to be but on it — which is the
    // strongest the attraction can be.
    expect(nearness(0)).toBe(0);
  });
});