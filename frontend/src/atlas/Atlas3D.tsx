// The 3D view of the Atlas (#5), drawn with react-three-fiber. Loaded only when chosen, so the 2D view (the
// default) doesn't carry three.js. It draws the scene from scene.ts, the same nodes and counts as the 2D view;
// a click on a node calls back to the page, which applies the same toggle (or opens "Why not?") as in 2D.

import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { SceneLayer, SceneNode } from "./scene";

interface Props {
  layers: SceneLayer[];
  onPick: (node: SceneNode) => void;
}

/** A theme token's colour, so the 3D view follows the page's light and dark themes. */
function token(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value === "" ? fallback : value;
}

/** A status's colour; "none" (no pathway fits) takes the colour of the page's lines. */
function colour(status: string): string {
  return token(status === "none" ? "--muted" : `--st-${status}`, "#888888");
}

/** A text label drawn on a canvas and shown as a sprite that always faces the camera. */
function Label({ text, position, size, muted }: { text: string; position: [number, number, number]; size: number; muted: boolean }) {
  const { texture, aspect } = useMemo(() => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const px = 48;
    const font = `${String(px)}px system-ui, sans-serif`;
    if (ctx) ctx.font = font;
    const width = Math.ceil((ctx?.measureText(text).width ?? px * text.length * 0.6) + px * 0.5);
    canvas.width = width;
    canvas.height = Math.ceil(px * 1.4);
    if (ctx) {
      ctx.font = font;
      ctx.fillStyle = muted ? token("--muted", "#666666") : token("--text", "#222222");
      ctx.textBaseline = "middle";
      ctx.fillText(text, px * 0.25, canvas.height / 2);
    }
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return { texture: t, aspect: canvas.width / canvas.height };
  }, [text, muted]);
  return (
    <sprite position={position} scale={[size * aspect, size, 1]}>
      <spriteMaterial map={texture} transparent depthWrite={false} />
    </sprite>
  );
}

function Node({ node, onPick, dragged }: { node: SceneNode; onPick: (n: SceneNode) => void; dragged: () => boolean }) {
  const [hover, setHover] = useState(false);
  const [x, y, z] = node.position;
  return (
    <group>
      <mesh
        position={node.position}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          if (!dragged()) onPick(node);
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
        <sphereGeometry args={[node.radius * (hover ? 1.3 : 1), 24, 16]} />
        <meshStandardMaterial
          color={colour(node.status)}
          emissive={node.selected ? colour(node.status) : "#000000"}
          emissiveIntensity={node.selected ? 0.6 : 0}
        />
      </mesh>
      {node.selected && (
        <mesh position={node.position} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[node.radius * 1.8, 0.02, 8, 32]} />
          <meshBasicMaterial color={colour(node.status)} />
        </mesh>
      )}
      {(hover || node.selected || node.count > 0) && (
        <Label
          text={`${node.label} (${String(node.count)})`}
          position={[x, y + node.radius + 0.18, z]}
          size={hover || node.selected ? 0.34 : 0.22}
          muted={node.count === 0}
        />
      )}
    </group>
  );
}

function Layer({ layer, onPick, dragged }: { layer: SceneLayer; onPick: (n: SceneNode) => void; dragged: () => boolean }) {
  return (
    <group>
      <mesh position={[0, layer.y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[layer.ringRadius - 0.01, layer.ringRadius + 0.01, 96]} />
        <meshBasicMaterial color={token("--line", "#cccccc")} side={THREE.DoubleSide} />
      </mesh>
      <Label text={layer.name} position={[-layer.ringRadius - 1.6, layer.y, 0]} size={0.4} muted={false} />
      {layer.nodes.map((n) => (
        <Node key={n.value} node={n} onPick={onPick} dragged={dragged} />
      ))}
    </group>
  );
}

export default function Atlas3D({ layers, onPick }: Props) {
  // Drag to rotate the stack about its vertical axis, and tilt it; a press that moves is a drag, not a click.
  const [turn, setTurn] = useState({ y: 0.4, x: 0.25 });
  const start = useRef<{ px: number; py: number; y: number; x: number; moved: boolean } | null>(null);
  const moved = useRef(false);
  const height = Math.max(...layers.map((l) => l.y)) - Math.min(...layers.map((l) => l.y));
  const widest = Math.max(...layers.map((l) => l.ringRadius));
  return (
    <div
      className="atlas-3d"
      onPointerDown={(e) => {
        start.current = { px: e.clientX, py: e.clientY, y: turn.y, x: turn.x, moved: false };
        moved.current = false;
      }}
      onPointerMove={(e) => {
        const s = start.current;
        if (!s) return;
        const dx = e.clientX - s.px;
        const dy = e.clientY - s.py;
        if (Math.abs(dx) + Math.abs(dy) > 4) moved.current = true;
        if (moved.current) setTurn({ y: s.y + dx * 0.01, x: Math.max(-0.6, Math.min(0.9, s.x + dy * 0.005)) });
      }}
      onPointerUp={() => {
        start.current = null;
      }}
      onPointerLeave={() => {
        start.current = null;
      }}
    >
      <Canvas camera={{ position: [0, 0, height * 1.5 + widest], fov: 45 }} dpr={[1, 2]}>
        <ambientLight intensity={0.8} />
        <directionalLight position={[5, 10, 7]} intensity={0.9} />
        <group rotation={[turn.x, turn.y, 0]}>
          {layers.map((l) => (
            <Layer key={l.tier} layer={l} onPick={onPick} dragged={() => moved.current} />
          ))}
        </group>
      </Canvas>
    </div>
  );
}
