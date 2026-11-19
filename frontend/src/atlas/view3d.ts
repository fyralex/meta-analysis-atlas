// The 3D map's camera arithmetic (#92, design E), kept apart from three.js so it can be tested on its own.

/** How far the wheel or a pinch can zoom, as a factor of the starting distance. */
export const ZOOM_MIN = 0.45;
export const ZOOM_MAX = 2.5;
const clampZoom = (z: number) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));

/** Half the camera's view at the map's centre, in scene units, for a 45° field of view. */
const HALF_VIEW = Math.tan((45 / 2) * (Math.PI / 180));

export interface View {
  zoom: number;
  pan: { x: number; y: number };
}

/**
 * The view after zooming by a factor, keeping the point under (fx, fy) still (in the plane through the map's
 * centre facing the camera, z = 0; points in front of or behind it shift a little, which reads as natural depth): the pointer's place, -1 to 1 across
 * the map, for a box of that aspect, with the camera at distance times the zoom.
 */
export function zoomed(view: View, factor: number, fx: number, fy: number, distance: number, aspect: number): View {
  const after = clampZoom(view.zoom * factor);
  const half = distance * HALF_VIEW;
  return {
    zoom: after,
    pan: {
      x: view.pan.x + fx * half * aspect * (view.zoom - after),
      y: view.pan.y + fy * half * (view.zoom - after),
    },
  };
}

/** What a key does on the focused map, like Google Earth's keys; null leaves it to the browser. */
export type KeyAction = "left" | "right" | "up" | "down" | "zoom-in" | "zoom-out" | "reset";

const KEYS: Record<string, KeyAction> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
  "+": "zoom-in",
  "=": "zoom-in",
  "-": "zoom-out",
  "0": "reset",
};

/**
 * The map's action for a key, or null. With Ctrl, Cmd or Alt held the key belongs to the browser, so the page
 * zoom (Ctrl or Cmd with +, - and 0) keeps working while the map has focus (WCAG 1.4.4).
 */
export function keyAction(e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }): KeyAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  return KEYS[e.key] ?? null;
}
