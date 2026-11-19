import { Link } from "react-router";
import { TIERS, type Tier } from "../atlas/filter";
import { map } from "../map";
import { Sources } from "../SourceList";
import type { Card } from "../types/cards";
import { cardById, cardHref } from "./cards";

interface Props {
  card: Card;
  /** The heading level of the card's title, to fit the page around it. */
  level: 2 | 3 | 4;
  /** Leave the title out where the page already names the card, with its badges (CardBadges). */
  hideTitle?: boolean;
  /**
   * Shown on the Cards page itself: links to other cards open on this page, and the card ends with a link to its
   * analyses in the Atlas. Elsewhere (the Atlas's About panels) links to cards open the Cards page.
   */
  onCardsPage?: boolean;
}

/** Sources go to other sites; every source line on a card says so (#92, design D). */
export const SOURCES_LABEL = "Sources (open outside the Atlas)";

/** A rule in plain words where the map has them (#92, D2), else as the map states it. */
function ruleText(id: string): string {
  return cardById(`rule:${id}`)?.plain?.title ?? map.rules.find((r) => r[0] === id)?.[1] ?? "";
}

const isTier = (t: string): t is Tier => (TIERS as readonly string[]).includes(t);

/** A card's own flags as badges: "new" (not in the reviewed draft) and "to check" (not yet confirmed). */
export function CardBadges({ card }: { card: Card }) {
  return (
    <>
      {/* the spaces keep an accessible name from running the title and the badges together */}
      {card.new && (
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

/** A glossary term used on a card: its definition opens in place, with its sources and its own card. */
function TermInPlace({ id, onCardsPage }: { id: string; onCardsPage: boolean }) {
  const term = cardById(id);
  if (!term) return null;
  const what = term.teach.filter((t) => t.kind === "what");
  return (
    <details className="term-in-place">
      <summary>
        <strong>{term.title}</strong> <span className="muted">(opens below)</span>
      </summary>
      {what.map((t) => (
        <div key={t.text} className="card-note">
          <p>{t.text}</p>
          <Sources src={t.src} label={SOURCES_LABEL} />
        </div>
      ))}
      <Link to={cardHref(term.id)}>
        The glossary card for {term.title.toLowerCase()}{" "}
        <span className="muted">{onCardsPage ? "(opens on this page)" : "(opens Cards)"}</span>
      </Link>
    </details>
  );
}

/**
 * One teaching card, laid out as design D of #92: what it is first, then the facts at a glance, when to use it,
 * its cautions, the R call, the rules behind its limits and the terms it uses, each line with its sources.
 */
export function CardView({ card, level, hideTitle = false, onCardsPage = false }: Props) {
  const H = `h${String(level)}` as "h2" | "h3" | "h4";
  const S = `h${String(level + 1)}` as "h3" | "h4" | "h5";
  const whats = card.teach.filter((t) => t.kind === "what");
  const [lead, ...moreWhat] = whats;
  const uses = card.teach.filter((t) => t.kind === "use");
  const cautions = card.teach.filter((t) => t.kind === "caution");
  const code = card.facts.filter((f) => f.code);
  const facts = card.facts.filter((f) => !f.code);
  const tier = card.tier;
  const analyses = isTier(tier) ? map.pathways.filter((p) => p[tier] === card.value).length : 0;
  return (
    <article className="card" aria-labelledby={hideTitle ? undefined : `card-${card.id}`}>
      {!hideTitle && (
        <H id={`card-${card.id}`} className="card-title">
          {card.title}
          <CardBadges card={card} />
        </H>
      )}
      {tier === "rule" && card.plain && (
        <section className="card-lead" aria-label="In plain words">
          <p>{card.plain.title}</p>
          {/* the plain sentence cites the rule's own sources; they are listed once, under the rule below */}
          {card.notes[0]?.src !== card.plain.src && <Sources src={card.plain.src} label={SOURCES_LABEL} />}
        </section>
      )}
      {lead && (
        <section className="card-lead" aria-label="What it is">
          <p>{lead.text}</p>
          <Sources src={lead.src} label={SOURCES_LABEL} />
          {moreWhat.map((t) => (
            <div key={t.text} className="card-note">
              <p>{t.text}</p>
              <Sources src={t.src} label={SOURCES_LABEL} />
            </div>
          ))}
        </section>
      )}
      {facts.length > 0 && (
        <section aria-label="At a glance">
          <dl className="facts">
            {facts.map((f) => (
              <div key={f.label}>
                <dt>{f.label}</dt>
                <dd>
                  {f.items.length === 1 ? (
                    f.items[0]
                  ) : (
                    <ul>
                      {f.items.map((it) => (
                        <li key={it}>{it}</li>
                      ))}
                    </ul>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {uses.length > 0 && (
        <section className="teach" aria-labelledby={`use-${card.id}`}>
          <S id={`use-${card.id}`}>When to use it</S>
          {uses.map((t) => (
            <div key={t.text} className="card-note">
              <p>{t.text}</p>
              <Sources src={t.src} label={SOURCES_LABEL} />
            </div>
          ))}
        </section>
      )}
      {cautions.length > 0 && (
        <section className="teach card-caution" aria-labelledby={`caution-${card.id}`}>
          <S id={`caution-${card.id}`}>Cautions</S>
          {cautions.map((t) => (
            <div key={t.text} className="card-note">
              <p>{t.text}</p>
              <Sources src={t.src} label={SOURCES_LABEL} />
            </div>
          ))}
        </section>
      )}
      {code.length > 0 && (
        <section className="teach" aria-labelledby={`r-${card.id}`}>
          <S id={`r-${card.id}`}>In R</S>
          {code.map((f) => (
            <div key={f.label}>
              <p className="card-code-label muted">{f.label}</p>
              <pre className="card-code">
                <code>{f.items.join("\n")}</code>
              </pre>
            </div>
          ))}
        </section>
      )}
      {card.notes.length > 0 && (
        <section className="teach" aria-labelledby={`notes-${card.id}`}>
          <S id={`notes-${card.id}`}>{tier === "rule" ? "The rule as the map states it" : "Notes from the map"}</S>
          {card.notes.map((n) => (
            <div key={n.text} className="card-note">
              <p>{n.text}</p>
              <Sources src={n.src} label={SOURCES_LABEL} />
            </div>
          ))}
        </section>
      )}
      {card.rules.length > 0 && (
        <section className="teach" aria-labelledby={`rules-${card.id}`}>
          <S id={`rules-${card.id}`}>Why it can&apos;t be combined with some choices</S>
          <ul className="card-rules">
            {card.rules.map((r) => (
              <li key={r}>
                {ruleText(r)} <Link to={cardHref(`rule:${r}`)}>Rule {r}</Link>{" "}
                <span className="muted">{onCardsPage ? "(opens the rule's card)" : "(opens its card in Cards)"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {card.terms.length > 0 && (
        <section className="teach" aria-labelledby={`terms-${card.id}`}>
          <S id={`terms-${card.id}`}>Terms on this card</S>
          {card.terms.map((t) => (
            <TermInPlace key={t} id={t} onCardsPage={onCardsPage} />
          ))}
        </section>
      )}
      {!(card.notes.length === 1 && card.notes[0]?.src === card.src) && (
        <Sources src={card.src} label="Where the map takes this from (opens outside the Atlas)" />
      )}
      {onCardsPage && isTier(tier) && analyses > 0 && (
        <p className="card-atlas">
          <Link className="button-primary" to={`/atlas?${new URLSearchParams({ [tier]: card.value }).toString()}`}>
            See {analyses === 1 ? "its 1 analysis" : `its ${String(analyses)} analyses`} in the Atlas, with{" "}
            {card.title} chosen
          </Link>
        </p>
      )}
    </article>
  );
}
