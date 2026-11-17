import { Link } from "react-router";
import { map } from "../map";
import { Sources } from "../SourceList";
import type { Card, TeachKind } from "../types/cards";
import { cardById, cardHref } from "./cards";

interface Props {
  card: Card;
  /** The heading level of the card's title, to fit the page around it. */
  level: 2 | 3 | 4;
  /** Leave the title out where the page already names the card, with its badges (CardBadges). */
  hideTitle?: boolean;
}

const TEACH_HEADINGS: { kind: TeachKind; text: string }[] = [
  { kind: "what", text: "What it is" },
  { kind: "use", text: "When to use it" },
  { kind: "caution", text: "Cautions" },
];

function ruleText(id: string): string {
  return map.rules.find((r) => r[0] === id)?.[1] ?? "";
}

/** A card's own flags as badges: "new" (not in the reviewed draft) and "to check" (not yet confirmed). */
export function CardBadges({ card }: { card: Card }) {
  return (
    <>
      {/* the spaces keep an accessible name from running the title and the badges together */}
      {card.added && (
        <>
          {" "}
          <span className="badge badge-new">new</span>
        </>
      )}
      {!card.verified && (
        <>
          {" "}
          <span className="badge badge-check">to check</span>
        </>
      )}
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
      {TEACH_HEADINGS.map(({ kind, text }) => {
        const lines = card.teach.filter((t) => t.kind === kind);
        if (lines.length === 0) return null;
        return (
          <section key={kind} className="teach" aria-label={text}>
            <p className="facts-label">{text}</p>
            {lines.map((t) => (
              <div key={t.text} className="card-note">
                <p>{t.text}</p>
                <Sources src={t.src} />
              </div>
            ))}
          </section>
        );
      })}
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
          <p className="facts-label" id={`rules-${card.id}`}>
            Rules behind its limits
          </p>
          <ul className="card-rules" aria-labelledby={`rules-${card.id}`}>
            {card.rules.map((r) => (
              <li key={r}>
                <Link to={cardHref(`rule:${r}`)}>Rule {r}</Link>: {ruleText(r)}
              </li>
            ))}
          </ul>
        </>
      )}
      {card.terms.length > 0 && (
        <>
          <p className="facts-label" id={`terms-${card.id}`}>
            Terms used
          </p>
          <ul className="card-terms" aria-labelledby={`terms-${card.id}`}>
            {card.terms.map((t) => (
              <li key={t}>
                <Link to={cardHref(t)}>{cardById(t)?.title ?? t}</Link>
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
