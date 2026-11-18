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
 * The view after zooming by a factor, keeping the point under (fx, fy) still: the pointer's place, -1 to 1 across
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
