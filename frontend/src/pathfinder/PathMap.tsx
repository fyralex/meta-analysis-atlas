import { lazy, Suspense, useMemo, useState } from "react";
import type { FilterOptions, Selection, TierOrder } from "../atlas/filter";
import { hasWebGL, links, scene } from "../atlas/scene";
import { View3DBoundary } from "../atlas/View3DBoundary";
import { map } from "../map";

// Pathfinder's small map (#92, design E2): the Atlas's 3D map, read-only, with the answers so far lit as a path.
// It turns and zooms like the Atlas's map, but its dots can't be clicked; the Atlas link beside it opens the map to
// choose on. Where 3D can't be drawn it is left out: the count and the link say the same in words.

const Atlas3D = lazy(() => import("../atlas/Atlas3D"));

interface Props {
  selection: Selection;
  order: TierOrder;
  options: FilterOptions;
}

export function PathMap({ selection, order, options }: Props) {
  const [webgl] = useState(hasWebGL);
  const [failed, setFailed] = useState(false);
  // Memoised on the answers, by value, so the line geometry is rebuilt only when they change.
  const key = JSON.stringify([selection, order, options]);
  const { layers, lines } = useMemo(() => {
    const l = scene(map.pathways, selection, order, options);
    return { layers: l, lines: links(map.pathways, selection, options, l) };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key holds them all, by value
  }, [key]);
  if (!webgl || failed) return null;
  return (
    <figure className="path-map">
      <View3DBoundary
        onError={() => {
          setFailed(true);
        }}
      >
        <Suspense fallback={<p className="muted">Loading the map…</p>}>
          <Atlas3D layers={layers} lines={lines} compact describedBy="path-map-caption" />
        </Suspense>
      </View3DBoundary>
      <figcaption className="muted" id="path-map-caption">
        Your answers so far, lit as a path through the map; it can't be clicked. Drag to turn it; scroll to zoom.
      </figcaption>
    </figure>
  );
}
