import { NavLink, Route, Routes, useLocation } from "react-router";
import { APPS } from "./apps";
import { AtlasPage } from "./atlas/AtlasPage";
import { CardsPage } from "./cards/CardsPage";
import { PathfinderPage } from "./pathfinder/PathfinderPage";
import { HomePage } from "./pages/HomePage";
import { NotBuiltPage } from "./pages/NotBuiltPage";
import { ThemeSwitch } from "./ThemeSwitch";
import { NotYet, RunPage, WorkbenchLayout } from "./workbench/WorkbenchPage";

export function App() {
  // The home page offers the three apps as its own doors, so the header doesn't repeat them there (#92).
  const home = useLocation().pathname === "/";
  return (
    <div className="shell">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="top">
        <NavLink to="/" className="brand">
          Meta-Analysis Atlas
        </NavLink>
        {home ? (
          <a className="about" href="https://github.com/fyralex/meta-analysis-atlas#readme">
            About this project <span className="muted">(opens GitHub)</span>
          </a>
        ) : (
          <nav aria-label="Apps">
            {APPS.map((a) => (
              <NavLink key={a.path} to={a.path}>
                {a.name}
              </NavLink>
            ))}
          </nav>
        )}
        <ThemeSwitch />
      </header>
      <main id="main" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/atlas" element={<AtlasPage />} />
          <Route path="/cards" element={<CardsPage />} />
          <Route path="/pathfinder" element={<PathfinderPage />} />
          <Route path="/workbench" element={<WorkbenchLayout />}>
            <Route index element={<RunPage />} />
            <Route
              path="casebook"
              element={<NotYet what="Published example datasets, each loadable into the Workbench in one click." issue={166} />}
            />
            <Route
              path="proof"
              element={<NotYet what="Every runnable analysis with its validation test, the published value and ours." issue={167} />}
            />
          </Route>
          <Route path="*" element={<NotBuiltPage name="Page not found" what="There is no page at this address." />} />
        </Routes>
      </main>
    </div>
  );
}
