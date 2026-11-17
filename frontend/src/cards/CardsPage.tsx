import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { TIERS } from "../atlas/filter";
import { TIER_NAMES } from "../atlas/names";
import type { CardTier } from "../types/cards";
import { cardById, cardHref, cards, searchCards } from "./cards";
import { CardBadges, CardView } from "./CardView";

const GROUPS: { tier: CardTier; name: string }[] = [
  ...TIERS.map((t) => ({ tier: t, name: TIER_NAMES[t] })),
  { tier: "rule", name: "Rules" },
  { tier: "term", name: "Glossary" },
];

export function CardsPage() {
  const [params] = useSearchParams();
  const [query, setQuery] = useState("");
  const id = params.get("card");
  const chosen = id === null ? undefined : cardById(id);
  const shown = searchCards(cards, query);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (chosen) heading.current?.focus();
  }, [chosen]);

  return (
    <section className="page cards-page">
      <h1>Cards</h1>
      <p className="lead">
        A card for every choice in the map and every rule, and a glossary of the terms they use. Each card shows what
        the map holds about it: what it is and when to use it, the R call or function, the data it reads, the notes
        and rules that apply, and where the map takes them from. A card has no teaching text where its only source
        hasn&apos;t been read yet.
      </p>

      {id !== null && (
        <section className="card-shown" aria-labelledby="card-shown-title">
          <h2 id="card-shown-title" className="card-title" tabIndex={-1} ref={heading}>
            {chosen ? (
              <>
                {`${GROUPS.find((g) => g.tier === chosen.tier)?.name ?? ""}: ${chosen.title}`}
                <CardBadges card={chosen} />
              </>
            ) : (
              "No such card"
            )}
          </h2>
          {chosen ? (
            <CardView card={chosen} level={3} hideTitle />
          ) : (
            <p>There is no card at this address. Choose one from the list below.</p>
          )}
        </section>
      )}

      <label className="search" htmlFor="card-search">
        Find a card
        <input
          id="card-search"
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
          }}
        />
      </label>
      <p className="muted" role="status">
        {shown.length} of {cards.length} cards
      </p>

      {GROUPS.map(({ tier, name }) => {
        const inTier = shown.filter((c) => c.tier === tier);
        if (inTier.length === 0) return null;
        return (
          <section key={tier} aria-labelledby={`cards-${tier}`}>
            <h2 id={`cards-${tier}`}>{name}</h2>
            <ul className="card-index">
              {inTier.map((c) => (
                <li key={c.id}>
                  <Link to={cardHref(c.id)} aria-current={c.id === id ? "page" : undefined}>
                    {c.title}
                  </Link>
                  <CardBadges card={c} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </section>
  );
}
