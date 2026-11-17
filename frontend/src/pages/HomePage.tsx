import { Link } from "react-router";
import { APPS } from "../apps";
import { countByStatus, map } from "../map";
import { STATUS_TEXT } from "../status";
import type { Status } from "../types/map";

export function HomePage() {
  const counts = countByStatus(map);
  return (
    <section className="page">
      <h1>A map of meta-analysis pathways</h1>
      <p className="lead">
        A pathway is one choice at each step a methodologist asks about: framework, group structure, datatype,
        outcome, model, method and metric. The map shows which combinations are valid, and why.
      </p>

      <p className="count">
        <strong>{map.pathways.length.toLocaleString("en")}</strong> pathways in the map
      </p>
      <table className="statuses">
        <caption>Pathways by status</caption>
        <tbody>
          {(Object.keys(STATUS_TEXT) as Status[]).map((s) => (
            <tr key={s}>
              <th scope="row">{STATUS_TEXT[s].name}</th>
              <td className="num">{counts[s]}</td>
              <td>{STATUS_TEXT[s].meaning}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>The apps</h2>
      <ul className="apps">
        {APPS.map((a) => (
          <li key={a.path}>
            <Link to={a.path}>{a.name}</Link>: {a.what} <span className="muted">{a.state}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
