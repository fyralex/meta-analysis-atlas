// The 3D view of the Atlas (#5), drawn with react-three-fiber, and since design E of #92 the Atlas's main view,
// as in the prototype map: layers of nodes joined by lines. It handles like Google Earth (the owner's choice): still
// until moved; drag to turn, and it glides to a stop when let go; the mouse wheel or a two-finger pinch zooms towards
// the pointer; with the keyboard, the arrow keys turn it, + and - zoom, and 0 resets the view. Loaded lazily, so pages without it don't carry three.js. It draws the scene
// from scene.ts, the same nodes and counts as the 2D view; a click on a node calls back to the page, which applies
// the same toggle (or opens "Why not?") as in 2D. Without onPick the map is read-only: it turns and zooms only.

import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import * as THREE from "three";
import { labelled, type SceneLayer, type SceneLink, type SceneNode } from "./scene";
import { keyAction, zoomed } from "./view3d";

interface Props {
  layers: SceneLayer[];
  /** The lines between neighbouring layers (scene.ts, links). */
  lines?: SceneLink[];
  /** Called when a node is clicked; leave it out for a read-only map. */
  onPick?: (node: SceneNode) => void;
}

/** How quickly a glide slows after a drag: the share of its speed kept every 1/60 s. */
const GLIDE_KEEP = 0.94;
/** The starting view, and the keyboard's steps. */
const START = { y: 0.4, x: 0.5 };
const TURN_STEP = 0.15;
const TILT_STEP = 0.1;
const ZOOM_STEP = 1.2;
const tilt = (x: number) => Math.max(-0.6, Math.min(0.9, x));

interface Palette {
  text: string;
  muted: string;
  line: string;
  status: (s: SceneNode["status"]) => string;
}

/** The page's theme colours, read once per render, so the 3D view follows the light and dark themes. */
function palette(): Palette {
  const css = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const muted = read("--muted", "#777777");
  const byStatus: Record<string, string> = {
    runnable: read("--st-runnable", "#2e7d32"),
    planned: read("--st-planned", "#2f62b5"),
    specified: read("--st-specified", "#7a4fb0"),
    to_check: read("--st-to_check", "#c47f12"),
  };
  return {
    text: read("--text", "#222222"),
    muted,
    line: read("--line", "#cccccc"),
    status: (s) => (s === "none" ? muted : (byStatus[s] ?? muted)),
  };
}

/** Re-render when the theme changes: the switch on the page, or the system's light or dark setting. */
function useThemeChange(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => {
      setTick((t) => t + 1);
    };
    const observer = new MutationObserver(bump);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "class"],
    });
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", bump);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", bump);
    };
  }, []);
  return tick;
}

/** A text label drawn on a canvas and shown as a sprite that always faces the camera. */
function Label({
  text,
  position,
  size,
  color,
}: {
  text: string;
  position: [number, number, number];
  size: number;
  color: string;
}) {
  const { texture, aspect } = useMemo(() => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const px = 48;
    const font = `${String(px)}px system-ui, sans-serif`;
    if (ctx) ctx.font = font;
    canvas.width = Math.ceil((ctx?.measureText(text).width ?? px * text.length * 0.6) + px * 0.5);
    canvas.height = Math.ceil(px * 1.4);
    if (ctx) {
      ctx.font = font;
      ctx.fillStyle = color;
      ctx.textBaseline = "middle";
      ctx.fillText(text, px * 0.25, canvas.height / 2);
    }
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return { texture: t, aspect: canvas.width / canvas.height };
  }, [text, color]);
  // A material doesn't dispose its texture: free each one when it is replaced or the label goes.
  useEffect(
    () => () => {
      texture.dispose();
    },
    [texture],
  );
  return (
    <sprite position={position} scale={[size * aspect, size, 1]}>
      <spriteMaterial map={texture} transparent depthWrite={false} />
    </sprite>
  );
}

interface NodeProps {
  node: SceneNode;
  /** Whether it shows its label at rest; a chosen or hovered node shows one anyway. */
  named: boolean;
  colors: Palette;
  onPick: ((n: SceneNode) => void) | undefined;
  dragged: { current: boolean };
}

function Node({ node, named, colors, onPick, dragged }: NodeProps) {
  const [hover, setHover] = useState(false);
  const [x, y, z] = node.position;
  const color = colors.status(node.status);
  // A node hovered when it goes away mustn't leave the pointer cursor behind.
  useEffect(
    () => () => {
      if (hover) document.body.style.cursor = "";
    },
    [hover],
  );
  return (
    <group>
      <mesh
        position={node.position}
        scale={hover ? 1.3 : 1}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          if (onPick && !dragged.current) onPick(node);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
          if (onPick) document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHover(false);
          document.body.style.cursor = "";
        }}
      >
        <sphereGeometry args={[node.radius, 24, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={node.selected ? color : "#000000"}
          emissiveIntensity={node.selected ? 0.6 : 0}
        />
      </mesh>
      {node.selected && (
        <mesh position={node.position} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[node.radius * 1.8, 0.02, 8, 32]} />
          <meshBasicMaterial color={color} />
        </mesh>
      )}
      {(hover || node.selected || named) && (
        <Label
          text={`${node.label} (${String(node.count)})`}
          position={[x, y + node.radius + 0.18, z]}
          size={hover || node.selected ? 0.48 : 0.34}
          color={node.count === 0 ? colors.muted : colors.text}
        />
      )}
    </group>
  );
}

interface TurntableProps {
  turn: { current: { x: number; y: number } };
  zoom: { current: number };
  /** Where the camera has moved sideways, to keep the point under the pointer still while zooming. */
  pan: { current: { x: number; y: number } };
  distance: number;
  children: ReactNode;
}

/** Turns the stack and places the camera from the latest drag and zoom every frame, so neither re-renders. */
function Turntable({ turn, zoom, pan, distance, children }: TurntableProps) {
  const group = useRef<THREE.Group>(null);
  useFrame(({ camera }) => {
    if (group.current) group.current.rotation.set(turn.current.x, turn.current.y, 0);
    camera.position.set(pan.current.x, pan.current.y, distance * zoom.current);
  });
  return <group ref={group}>{children}</group>;
}

/** The lines between neighbouring layers, drawn as one set of segments. */
function Lines({ lines, color }: { lines: SceneLink[]; color: string }) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        lines.flatMap((l) => [...l.from, ...l.to]),
        3,
      ),
    );
    return g;
  }, [lines]);
  useEffect(
    () => () => {
      geometry.dispose();
    },
    [geometry],
  );
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={color} transparent opacity={0.35} />
    </lineSegments>
  );
}

/** Whether the system asks for less motion: then a drag stops where it is let go, without a glide. */
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** What the scene shows, in words, for screen readers; the 2D view has the same in full. */
function describe(layers: SceneLayer[]): string {
  const parts = layers.map(
    (l) =>
      `${l.name}: ${String(l.nodes.filter((n) => n.count > 0).length)} of ${String(l.nodes.length)} nodes possible`,
  );
  return `The map in 3D. ${parts.join("; ")}. The arrow keys turn it, + and - zoom, 0 resets the view.`;
}

export default function Atlas3D({ layers, lines = [], onPick }: Props) {
  useThemeChange();
  const colors = palette();
  // Drag with one pointer to turn and tilt the stack; a press that moves is a drag, not a click.
  const turn = useRef(START);
  const start = useRef<{
    id: number;
    px: number;
    py: number;
    y: number;
    x: number;
  } | null>(null);
  const dragged = useRef(false);
  // The drag's latest speed (radians a millisecond), for the glide when it is let go.
  const speed = useRef({ y: 0, x: 0, at: 0 });
  const glide = useRef(0);
  // Zoom: the mouse wheel, or two fingers pinching (their distance against where the pinch began).
  const zoom = useRef(1);
  const pan = useRef({ x: 0, y: 0 });
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ gap: number; zoom: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const height = Math.max(...layers.map((l) => l.y)) - Math.min(...layers.map((l) => l.y));
  const widest = Math.max(...layers.map((l) => l.ringRadius));
  const distance = height * 1.5 + widest;
  const aspect = () => {
    const el = box.current;
    return el && el.clientHeight > 0 ? el.clientWidth / el.clientHeight : 1;
  };
  /** Zoom by a factor, keeping the point under (fx, fy) still (the centre by default). */
  const zoomBy = (factor: number, fx = 0, fy = 0) => {
    const v = zoomed({ zoom: zoom.current, pan: pan.current }, factor, fx, fy, distance, aspect());
    zoom.current = v.zoom;
    pan.current = v.pan;
  };
  const stopGlide = () => {
    cancelAnimationFrame(glide.current);
    glide.current = 0;
  };
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    // Not passive, so the page doesn't scroll while the wheel zooms the map.
    // Ctrl with the wheel stays with the map too: a trackpad pinch arrives that way on macOS. The keyboard's page
    // zoom (Ctrl or Cmd with + and -) still reaches the browser (keyAction).
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      cancelAnimationFrame(glide.current);
      const r = el.getBoundingClientRect();
      const fx = ((e.clientX - r.left) / Math.max(1, r.width)) * 2 - 1;
      const fy = 1 - ((e.clientY - r.top) / Math.max(1, r.height)) * 2;
      const v = zoomed(
        { zoom: zoom.current, pan: pan.current },
        Math.exp(e.deltaY * 0.001),
        fx,
        fy,
        distance,
        r.width / Math.max(1, r.height),
      );
      zoom.current = v.zoom;
      pan.current = v.pan;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      cancelAnimationFrame(glide.current);
    };
  }, [distance]);
  /** After a drag, keep turning at its last speed, slowing to a stop, as Google Earth's globe does. */
  const startGlide = () => {
    const v = { ...speed.current };
    if (reducedMotion() || performance.now() - v.at > 80) return;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      turn.current = {
        y: turn.current.y + v.y * dt,
        x: tilt(turn.current.x + v.x * dt),
      };
      const keep = GLIDE_KEEP ** (dt / (1000 / 60));
      v.y *= keep;
      v.x *= keep;
      glide.current = Math.abs(v.y) + Math.abs(v.x) > 0.00002 ? requestAnimationFrame(tick) : 0;
    };
    glide.current = requestAnimationFrame(tick);
  };
  const gap = () => {
    const [a, b] = [...touches.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  useEffect(
    () => () => {
      document.body.style.cursor = "";
    },
    [],
  );
  const end = (e: PointerEvent) => {
    touches.current.delete(e.pointerId);
    if (touches.current.size < 2) pinch.current = null;
    if (start.current?.id === e.pointerId) {
      start.current = null;
      if (dragged.current && e.type === "pointerup") startGlide();
    }
  };

  return (
    <div
      ref={box}
      className="atlas-3d"
      role="application"
      aria-roledescription="3D map"
      aria-label={describe(layers)}
      tabIndex={0}
      onKeyDown={(e) => {
        const action = keyAction(e);
        if (!action) return;
        e.preventDefault();
        stopGlide();
        const t = turn.current;
        if (action === "left") turn.current = { ...t, y: t.y - TURN_STEP };
        if (action === "right") turn.current = { ...t, y: t.y + TURN_STEP };
        if (action === "up") turn.current = { ...t, x: tilt(t.x - TILT_STEP) };
        if (action === "down") turn.current = { ...t, x: tilt(t.x + TILT_STEP) };
        if (action === "zoom-in") zoomBy(1 / ZOOM_STEP);
        if (action === "zoom-out") zoomBy(ZOOM_STEP);
        if (action === "reset") {
          turn.current = START;
          zoom.current = 1;
          pan.current = { x: 0, y: 0 };
        }
      }}
      onPointerDown={(e) => {
        stopGlide();
        touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (touches.current.size === 2) {
          // A second finger: a pinch to zoom, not a drag.
          start.current = null;
          dragged.current = true;
          pinch.current = { gap: gap(), zoom: zoom.current };
          return;
        }
        if (!e.isPrimary) return;
        start.current = {
          id: e.pointerId,
          px: e.clientX,
          py: e.clientY,
          ...turn.current,
        };
        dragged.current = false;
      }}
      onPointerMove={(e) => {
        if (touches.current.has(e.pointerId)) touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const p = pinch.current;
        if (p && p.gap > 0) {
          zoomBy((p.zoom * p.gap) / Math.max(1, gap()) / zoom.current);
          return;
        }
        const s = start.current;
        if (!s || e.pointerId !== s.id) return;
        const dx = e.clientX - s.px;
        const dy = e.clientY - s.py;
        if (!dragged.current && Math.abs(dx) + Math.abs(dy) > 4) {
          // Capture only once it is a drag, so a plain click still reaches the scene's nodes.
          dragged.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
        }
        if (dragged.current) {
          const next = { y: s.y + dx * 0.01, x: tilt(s.x + dy * 0.005) };
          const now = performance.now();
          const dt = Math.max(1, now - speed.current.at);
          speed.current = {
            y: (next.y - turn.current.y) / dt,
            x: (next.x - turn.current.x) / dt,
            at: now,
          };
          turn.current = next;
        }
      }}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <Canvas camera={{ position: [0, 0, distance], fov: 45 }} dpr={[1, 2]}>
        <ambientLight intensity={0.8} />
        <directionalLight position={[5, 10, 7]} intensity={0.9} />
        <Turntable turn={turn} zoom={zoom} pan={pan} distance={distance}>
          <Lines lines={lines} color={colors.muted} />
          {layers.map((l) => {
            const named = labelled(l);
            return (
              <group key={l.tier}>
                <mesh position={[0, l.y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                  <ringGeometry args={[l.ringRadius - 0.01, l.ringRadius + 0.01, 96]} />
                  <meshBasicMaterial color={colors.line} side={THREE.DoubleSide} />
                </mesh>
                <Label text={l.name} position={[-l.ringRadius - 1.6, l.y, 0]} size={0.4} color={colors.text} />
                {l.nodes.map((n) => (
                  <Node
                    key={n.value}
                    node={n}
                    named={named.has(n.value)}
                    colors={colors}
                    onPick={onPick}
                    dragged={dragged}
                  />
                ))}
              </group>
            );
          })}
        </Turntable>
      </Canvas>
    </div>
  );
}
