import { NavLink, Route, Routes } from "react-router";
import { APPS } from "./apps";
import { AtlasPage } from "./atlas/AtlasPage";
import { CardsPage } from "./cards/CardsPage";
import { PathfinderPage } from "./pathfinder/PathfinderPage";
import { HomePage } from "./pages/HomePage";
import { NotBuiltPage } from "./pages/NotBuiltPage";
import { ThemeSwitch } from "./ThemeSwitch";

export function App() {
  return (
    <div className="shell">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="top">
        <NavLink to="/" className="brand">
          Meta-Analysis Atlas
        </NavLink>
        <nav aria-label="Apps">
          {APPS.map((a) => (
            <NavLink key={a.path} to={a.path}>
              {a.name}
            </NavLink>
          ))}
        </nav>
        <ThemeSwitch />
      </header>
      <main id="main" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/atlas" element={<AtlasPage />} />
          <Route path="/cards" element={<CardsPage />} />
          <Route path="/pathfinder" element={<PathfinderPage />} />
          <Route path="*" element={<NotBuiltPage name="Page not found" what="There is no page at this address." />} />
        </Routes>
      </main>
    </div>
  );
}
