import { Link } from "react-router";
import { cards } from "../cards/cards";
import { map } from "../map";
import { QUESTIONS, RARE, VARY } from "../pathfinder/flow";

// The home page (#92, design A): one promise and three doors, each saying where it goes, what is there and who
// it is for. The counts come from the map, so they stay true as it changes.
const pathways = map.pathways.length;
const frameworks = new Set(map.pathways.map((p) => p.framework)).size;
const terms = cards.filter((c) => c.tier === "term").length;
const choiceCards = cards.length - terms;
/** Pathfinder's questions at most: its four, then the two it asks only where they apply. */
const questions = QUESTIONS.length + [RARE, VARY].length;

interface Door {
  to: string;
  title: string;
  what: string;
  app: string;
  detail: string;
  primary?: boolean;
}

const DOORS: Door[] = [
  {
    to: "/pathfinder",
    title: "Plan my analysis",
    what: `Answer up to ${String(questions)} short questions about your studies. See the analyses that fit, and why.`,
    app: "Pathfinder",
    detail: "For review authors",
    primary: true,
  },
  {
    to: "/cards",
    title: "Learn the building blocks",
    what: "What is a random-effects model? When is Peto's method used? A card for each choice and rule, with its sources.",
    app: "Cards",
    detail: `${String(choiceCards)} cards and a glossary of ${String(terms)} terms · for students`,
  },
  {
    to: "/atlas",
    title: "See the whole map",
    what: `Every pathway across ${String(frameworks)} frameworks, and the rules that decide which choices go together.`,
    app: "Atlas",
    detail: `All ${String(pathways)} pathways · for methodologists`,
  },
];

export function HomePage() {
  return (
    <section className="page home">
      <div className="home-intro">
        <h1>Find the right meta-analysis for your review, and see why it fits.</h1>
        <p className="lead">
          {pathways} ways to pool studies, with the reasons each choice fits or doesn&apos;t and the sources behind them.
        </p>
      </div>

      <section aria-labelledby="doors" className="home-doors">
        <h2 id="doors">What would you like to do?</h2>
        <ul className="doors">
          {DOORS.map((d) => (
            <li key={d.to}>
              <Link to={d.to} className={d.primary ? "door door-primary" : "door"}>
                <span className="door-title">{d.title}</span>
                <span className="door-what">{d.what}</span>
                <span className="door-where">
                  <span>
                    Opens <strong>{d.app}</strong>
                  </span>
                  <span>{d.detail}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <p className="home-status muted">
        Version 0.1 shows the map and its reasons; it doesn&apos;t run analyses yet. Version 0.2 is planned to run the
        first ones, for one and two groups, on your own data.
      </p>
    </section>
  );
}
