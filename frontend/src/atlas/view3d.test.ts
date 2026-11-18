import { describe, expect, it } from "vitest";
import { ZOOM_MAX, ZOOM_MIN, zoomed } from "./view3d";

const START = { zoom: 1, pan: { x: 0, y: 0 } };
const HALF = Math.tan((45 / 2) * (Math.PI / 180));

/** Where a point at (fx, fy) across the view sits in the scene's plane, for a view and camera distance. */
const under = (v: typeof START, fx: number, fy: number, distance: number, aspect: number) => ({
  x: v.pan.x + fx * distance * v.zoom * HALF * aspect,
  y: v.pan.y + fy * distance * v.zoom * HALF,
});

describe("the 3D map's zoom", () => {
  it("keeps the point under the pointer still, as Google Earth does", () => {
    for (const [fx, fy, factor] of [
      [0.5, -0.3, 0.8],
      [-0.9, 0.9, 1.25],
      [0, 0, 0.5],
    ] as const) {
      const before = under(START, fx, fy, 20, 1.6);
      const v = zoomed(START, factor, fx, fy, 20, 1.6);
      const after = under(v, fx, fy, 20, 1.6);
      expect(after.x).toBeCloseTo(before.x, 10);
      expect(after.y).toBeCloseTo(before.y, 10);
      expect(v.zoom).toBeCloseTo(factor, 10);
    }
  });

  it("zooms about the centre without moving sideways", () => {
    expect(zoomed(START, 0.7, 0, 0, 20, 1.6).pan).toEqual({ x: 0, y: 0 });
  });

  it("stops at the nearest and farthest zoom", () => {
    expect(zoomed(START, 0.01, 0.2, 0.2, 20, 1).zoom).toBe(ZOOM_MIN);
    expect(zoomed(START, 100, 0.2, 0.2, 20, 1).zoom).toBe(ZOOM_MAX);
  });
});
