import { Link } from "react-router";
import { cardFor, cardHref } from "../cards/cards";
import { CardBadges, CardView } from "../cards/CardView";
import type { Tier } from "./filter";

/** The card of a layer's chosen node, folded under the layer until opened. */
export function AboutCard({ tier, value, label }: { tier: Tier; value: string; label: string }) {
  const card = cardFor(tier, value);
  if (!card) return null;
  return (
    <details className="about">
      <summary>
        About {label}
        <CardBadges card={card} />
      </summary>
      {/* level 2: the panel sits under the layer's h2, so the card's sections are h3 */}
      <CardView card={card} level={2} hideTitle />
      <p>
        <Link to={cardHref(card.id)}>Open this card on the Cards page</Link>
      </p>
    </details>
  );
}
