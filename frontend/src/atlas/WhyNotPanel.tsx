import { useEffect, useRef } from "react";
import { Link } from "react-router";
import { cardHref } from "../cards/cards";
import { map } from "../map";
import { Sources } from "../SourceList";
import type { Tier } from "./filter";
import { TIER_NAMES } from "./names";
import { ruleText, type Explanation, type Reason } from "./whyNot";

interface Props {
  tier: Tier;
  label: string;
  explanation: Explanation;
  labelOf: (tier: Tier, value: string) => string;
  onClose: () => void;
}

function ReasonItem({ reason }: { reason: Reason }) {
  return (
    <li>
      <p>{reason.text}</p>
      {reason.rule && (
        <p className="rule">
          <strong>
            <Link to={cardHref(`rule:${reason.rule}`)}>Rule {reason.rule}</Link>:
          </strong> {ruleText(map, reason.rule)}
        </p>
      )}
      <Sources src={reason.src} />
    </li>
  );
}

const lower = (t: Tier) => TIER_NAMES[t].toLowerCase();

/** "Why not?" for one greyed-out node: which choices it can't go with, and the reasons, with their sources. */
export function WhyNotPanel({ tier, label, explanation, labelOf, onClose }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [tier, label]);

  return (
    <div
      className="why-not"
      id={`why-not-panel-${tier}`}
      role="region"
      aria-labelledby={`why-not-${tier}`}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <h3 id={`why-not-${tier}`} tabIndex={-1} ref={heading}>
        Why not {label}?
      </h3>
      {explanation.kind === "blocked" &&
        explanation.blockers.map((b) => (
          <div key={b.tier}>
            <p>
              No pathway has {label} with your choice of {lower(b.tier)}, {labelOf(b.tier, b.value)}.
            </p>
            <ul className="reasons">
              {b.reasons.map((r) => (
                <ReasonItem key={r.text} reason={r} />
              ))}
            </ul>
          </div>
        ))}
      {explanation.kind === "together" && (
        <p>
          It fits each of your choices on its own, but not all of them together.
          {explanation.tiers.length > 0 && (
            <>
              {" "}
              Clearing your choice of {explanation.tiers.map(lower).join(" or ")} would let it fit.
            </>
          )}
        </p>
      )}
      {explanation.kind === "fits" && <p>It fits your choices.</p>}
      {explanation.kind === "hidden-new" && (
        <p>
          It fits your choices only through entries marked new, and those are hidden. Untick &ldquo;Hide entries
          marked new&rdquo; to see them.
        </p>
      )}
      <button type="button" className="clear" onClick={onClose}>
        Close
      </button>
    </div>
  );
}
