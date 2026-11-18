import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { TIERS, type Tier } from "../atlas/filter";
import { TIER_NAMES } from "../atlas/names";
import { QUESTIONS } from "../pathfinder/flow";
import type { CardTier } from "../types/cards";
import { cardById, cardHref, cards, searchCards } from "./cards";
import { CardBadges, CardView } from "./CardView";

// The Cards page, laid out as design D of #92: the list beside the card, its groups named as Pathfinder asks
// its questions, and the card answer first.

/** A group's name: Pathfinder's short name for the tiers it asks about, so the two pages use the same words. */
function groupName(tier: Tier): string {
  if (tier === "metric") return "Effect measure";
  return QUESTIONS.find((q) => q.tier === tier)?.short ?? TIER_NAMES[tier];
}

const GROUPS: { tier: CardTier; name: string }[] = [
  ...TIERS.map((t) => ({ tier: t, name: groupName(t) })),
  { tier: "rule", name: "Rules" },
  { tier: "term", name: "Glossary" },
];

/** A few cards to start from when none is open. */
const STARTERS = ["model:random-effects", "method:PETO", "term:continuity-correction"];

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
  const group = GROUPS.find((g) => g.tier === chosen?.tier)?.name ?? "";

  return (
    <section className="page cards-page">
      <h1>Learn the building blocks</h1>
      <p className="lead">A card for each choice in the map, each rule and each term. Every line says where it comes from.</p>

      <div className="cards-body">
        <nav className="cards-list" aria-label="All cards">
          <label className="search" htmlFor="card-search">
            Find a card
            <input
              id="card-search"
              type="search"
              placeholder="For example, Peto or odds ratio"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
              }}
            />
          </label>
          <p className="muted" role="status">
            {query === "" ? `${String(cards.length)} cards` : `${String(shown.length)} of ${String(cards.length)} cards`}
          </p>
          <div className="cards-groups">
            {GROUPS.map(({ tier, name }) => {
              const inTier = shown.filter((c) => c.tier === tier);
              if (inTier.length === 0) return null;
              return (
                <details key={tier} open={query !== "" || tier === chosen?.tier}>
                  <summary id={`cards-${tier}`}>
                    {name} <span className="muted">({inTier.length})</span>
                  </summary>
                  <ul className="card-index" aria-labelledby={`cards-${tier}`}>
                    {inTier.map((c) => (
                      <li key={c.id}>
                        <Link to={cardHref(c.id)} aria-current={c.id === id ? "page" : undefined}>
                          {c.title}
                        </Link>
                        <CardBadges card={c} />
                      </li>
                    ))}
                  </ul>
                </details>
              );
            })}
          </div>
          <dl className="cards-legend muted">
            <div>
              <dt>
                <span className="badge badge-check">to check</span>
              </dt>
              <dd>not yet confirmed from a primary source</dd>
            </div>
            <div>
              <dt>
                <span className="badge badge-new">new</span>
              </dt>
              <dd>not in the reviewed draft the map started from</dd>
            </div>
          </dl>
        </nav>

        <section className="card-shown" aria-label={chosen ? `${group}: ${chosen.title}` : "Card"}>
          {id === null ? (
            <>
              <h2>Choose a card from the list</h2>
              <p>Or start with one of these:</p>
              <ul>
                {STARTERS.map((s) => {
                  const c = cardById(s);
                  return c ? (
                    <li key={s}>
                      <Link to={cardHref(s)}>{c.title}</Link>
                    </li>
                  ) : null;
                })}
              </ul>
            </>
          ) : chosen ? (
            <>
              <p className="card-kind">{group}</p>
              <h2 className="card-title" tabIndex={-1} ref={heading}>
                {chosen.title}
                <CardBadges card={chosen} />
              </h2>
              <CardView card={chosen} level={2} hideTitle atlasLink />
            </>
          ) : (
            <>
              <h2 tabIndex={-1} ref={heading}>
                No such card
              </h2>
              <p>There is no card at this address. Choose one from the list.</p>
            </>
          )}
        </section>
      </div>
    </section>
  );
}
