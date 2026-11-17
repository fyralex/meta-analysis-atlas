// The 3D view of the Atlas (#5), drawn with react-three-fiber. Loaded only when chosen, so the 2D view (the
// default) doesn't carry three.js. It draws the scene from scene.ts, the same nodes and counts as the 2D view;
// a click on a node calls back to the page, which applies the same toggle (or opens "Why not?") as in 2D.

import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import type { SceneLayer, SceneNode } from "./scene";

interface Props {
  layers: SceneLayer[];
  onPick: (node: SceneNode) => void;
}

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
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
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
function Label({ text, position, size, color }: { text: string; position: [number, number, number]; size: number; color: string }) {
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
  colors: Palette;
  onPick: (n: SceneNode) => void;
  dragged: { current: boolean };
}

function Node({ node, colors, onPick, dragged }: NodeProps) {
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
          if (!dragged.current) onPick(node);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
          document.body.style.cursor = "pointer";
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
      {(hover || node.selected || node.count > 0) && (
        <Label
          text={`${node.label} (${String(node.count)})`}
          position={[x, y + node.radius + 0.18, z]}
          size={hover || node.selected ? 0.34 : 0.22}
          color={node.count === 0 ? colors.muted : colors.text}
        />
      )}
    </group>
  );
}

/** Turns the stack to the latest drag every frame, so a drag re-renders nothing. */
function Turntable({ turn, children }: { turn: { current: { x: number; y: number } }; children: ReactNode }) {
  const group = useRef<THREE.Group>(null);
  useFrame(() => {
    if (group.current) group.current.rotation.set(turn.current.x, turn.current.y, 0);
  });
  return <group ref={group}>{children}</group>;
}

/** What the scene shows, in words, for screen readers; the 2D view has the same in full. */
function describe(layers: SceneLayer[]): string {
  const parts = layers.map(
    (l) => `${l.name}: ${String(l.nodes.filter((n) => n.count > 0).length)} of ${String(l.nodes.length)} nodes possible`,
  );
  return `The map in 3D. ${parts.join("; ")}. The 2D view lists the same nodes and counts.`;
}

export default function Atlas3D({ layers, onPick }: Props) {
  useThemeChange();
  const colors = palette();
  // Drag with one pointer to turn and tilt the stack; a press that moves is a drag, not a click.
  const turn = useRef({ y: 0.4, x: 0.25 });
  const start = useRef<{ id: number; px: number; py: number; y: number; x: number } | null>(null);
  const dragged = useRef(false);
  useEffect(
    () => () => {
      document.body.style.cursor = "";
    },
    [],
  );
  const height = Math.max(...layers.map((l) => l.y)) - Math.min(...layers.map((l) => l.y));
  const widest = Math.max(...layers.map((l) => l.ringRadius));
  const end = () => {
    start.current = null;
  };
  return (
    <div
      className="atlas-3d"
      role="img"
      aria-label={describe(layers)}
      onPointerDown={(e) => {
        if (!e.isPrimary) return;
        start.current = { id: e.pointerId, px: e.clientX, py: e.clientY, ...turn.current };
        dragged.current = false;
      }}
      onPointerMove={(e) => {
        const s = start.current;
        if (!s || e.pointerId !== s.id) return;
        const dx = e.clientX - s.px;
        const dy = e.clientY - s.py;
        if (!dragged.current && Math.abs(dx) + Math.abs(dy) > 4) {
          // Capture only once it is a drag, so a plain click still reaches the scene's nodes.
          dragged.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
        }
        if (dragged.current) turn.current = { y: s.y + dx * 0.01, x: Math.max(-0.6, Math.min(0.9, s.x + dy * 0.005)) };
      }}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <Canvas camera={{ position: [0, 0, height * 1.5 + widest], fov: 45 }} dpr={[1, 2]}>
        <ambientLight intensity={0.8} />
        <directionalLight position={[5, 10, 7]} intensity={0.9} />
        <Turntable turn={turn}>
          {layers.map((l) => (
            <group key={l.tier}>
              <mesh position={[0, l.y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[l.ringRadius - 0.01, l.ringRadius + 0.01, 96]} />
                <meshBasicMaterial color={colors.line} side={THREE.DoubleSide} />
              </mesh>
              <Label text={l.name} position={[-l.ringRadius - 1.6, l.y, 0]} size={0.4} color={colors.text} />
              {l.nodes.map((n) => (
                <Node key={n.value} node={n} colors={colors} onPick={onPick} dragged={dragged} />
              ))}
            </group>
          ))}
        </Turntable>
      </Canvas>
    </div>
  );
}
