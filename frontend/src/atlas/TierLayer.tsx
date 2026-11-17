import type { KeyboardEvent } from "react";
import { STATUS_TEXT } from "../status";
import { STATUSES } from "../types/map";
import type { NodeSummary } from "./filter";

interface Props {
  id: string;
  name: string;
  nodes: NodeSummary[];
  label: (value: string) => string;
  /** The entry's own flags, for tiers whose values are entries in the map (methods, metrics). */
  flags?: (value: string) => { added: boolean; verified: boolean } | undefined;
  onChoose: (value: string) => void;
}

/** What a screen reader hears: the visible label first, then the count by status. */
function spoken(text: string, node: NodeSummary, entry?: { added: boolean; verified: boolean }): string {
  const marks = [entry?.added ? "new" : "", entry && !entry.verified ? "to check" : ""].filter(Boolean);
  const name = marks.length > 0 ? `${text} (${marks.join(", ")})` : text;
  if (node.count === 0) return `${name}, 0 pathways: not compatible with your other choices`;
  const parts = STATUSES.filter((s) => node.byStatus[s] > 0).map(
    (s) => `${String(node.byStatus[s])} ${STATUS_TEXT[s].name.toLowerCase()}`,
  );
  if (node.newCount > 0) parts.push(`${String(node.newCount)} new`);
  return `${name}, ${String(node.count)} pathways: ${parts.join(", ")}`;
}

/**
 * One tier of the map: a toolbar of toggle buttons, one per value. Tab reaches the
 * group once; the arrow keys, Home and End move between its nodes. A node with no
 * compatible pathway stays focusable, so it can be read; choosing it does nothing.
 */
export function TierLayer({ id, name, nodes, label, flags, onChoose }: Props) {
  const tabStop = Math.max(
    0,
    nodes.findIndex((n) => n.selected),
  );

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = nodes.length - 1;
    const target = { ArrowRight: index + 1, ArrowDown: index + 1, ArrowLeft: index - 1, ArrowUp: index - 1, Home: 0, End: last }[
      e.key
    ];
    if (target === undefined) return;
    e.preventDefault();
    const buttons = e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button.node");
    buttons?.[Math.min(last, Math.max(0, target))]?.focus();
  }

  return (
    <section className="layer" aria-labelledby={id}>
      <h2 id={id}>{name}</h2>
      <div className="nodes" role="toolbar" aria-orientation="horizontal" aria-labelledby={id}>
        {nodes.map((node, i) => {
          const none = node.count === 0;
          const entry = flags?.(node.value);
          const isNew = entry?.added === true;
          const toCheck = entry !== undefined && !entry.verified;
          return (
            <button
              key={node.value}
              type="button"
              className="node"
              aria-label={spoken(label(node.value), node, entry)}
              aria-pressed={node.selected}
              aria-disabled={none}
              tabIndex={i === tabStop ? 0 : -1}
              onClick={() => {
                onChoose(node.value); // the caller's toggle() refuses a node with no compatible pathway
              }}
              onKeyDown={(e) => {
                onKeyDown(e, i);
              }}
            >
              <span className="node-label">{label(node.value)}</span>
              <span className="node-meta" aria-hidden="true">
                <span className="node-count">{node.count}</span>
                {isNew && (
                  <span className="badge badge-new">
                    new
                  </span>
                )}
                {toCheck && (
                  <span className="badge badge-check">
                    to check
                  </span>
                )}
              </span>
              {!none && (
                <span className="node-bar" aria-hidden="true">
                  {STATUSES.filter((s) => node.byStatus[s] > 0).map((s) => (
                    <span key={s} className={`seg st-${s}`} style={{ flexGrow: node.byStatus[s] }} />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
