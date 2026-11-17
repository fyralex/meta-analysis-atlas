import { Link } from "react-router";
import { map } from "../map";
import { Sources } from "../SourceList";
import type { Card } from "../types/cards";
import { cardHref } from "./cards";

interface Props {
  card: Card;
  /** The heading level of the card's title, to fit the page around it. */
  level: 2 | 3 | 4;
  /** Leave the title out where the page already names the card, with its badges (CardBadges). */
  hideTitle?: boolean;
}

function ruleText(id: string): string {
  return map.rules.find((r) => r[0] === id)?.[1] ?? "";
}

/** A card's own flags as badges: "new" (not in the reviewed draft) and "to check" (not yet confirmed). */
export function CardBadges({ card }: { card: Card }) {
  return (
    <>
      {card.added && <span className="badge badge-new">new</span>}
      {!card.verified && <span className="badge badge-check">to check</span>}
    </>
  );
}

/** One teaching card: what the map holds about a node or rule, with its sources. */
export function CardView({ card, level, hideTitle = false }: Props) {
  const H = `h${String(level)}` as "h2" | "h3" | "h4";
  return (
    <article className="card" aria-labelledby={hideTitle ? undefined : `card-${card.id}`}>
      {!hideTitle && (
        <H id={`card-${card.id}`} className="card-title">
          {card.title}
          <CardBadges card={card} />
        </H>
      )}
      {card.facts.length > 0 && (
        <dl className="facts">
          {card.facts.map((f) => (
            <div key={f.label}>
              <dt>{f.label}</dt>
              <dd>
                {f.items.length === 1 ? (
                  f.code ? (
                    <code>{f.items[0]}</code>
                  ) : (
                    f.items[0]
                  )
                ) : (
                  <ul>
                    {f.items.map((it) => (
                      <li key={it}>{f.code ? <code>{it}</code> : it}</li>
                    ))}
                  </ul>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {card.notes.map((n) => (
        <div key={n.text} className="card-note">
          <p>{n.text}</p>
          <Sources src={n.src} />
        </div>
      ))}
      {card.rules.length > 0 && (
        <>
          <p className="facts-label">Rules behind its limits</p>
          <ul className="card-rules">
            {card.rules.map((r) => (
              <li key={r}>
                <Link to={cardHref(`rule:${r}`)}>Rule {r}</Link>: {ruleText(r)}
              </li>
            ))}
          </ul>
        </>
      )}
      {!(card.notes.length === 1 && card.notes[0]?.src === card.src) && (
        <Sources src={card.src} label="Where the map takes this from" />
      )}
    </article>
  );
}
