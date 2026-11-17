import { map } from "./map";
import { references } from "./sources";

/** A source string as linked references: "Sources: label (sections); label". */
export function Sources({ src, label = "Sources" }: { src: string; label?: string }) {
  const refs = references(map, src);
  return (
    <p className="refs">
      {label}:{" "}
      {refs.map((r, i) => (
        <span key={r.key}>
          {i > 0 && "; "}
          {r.url ? <a href={r.url}>{r.label}</a> : r.label}
          {r.sections.length > 0 && <> ({r.sections.join(", ")})</>}
        </span>
      ))}
    </p>
  );
}
