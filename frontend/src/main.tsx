import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router";
import { App } from "./App";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("The page has no #root element.");

createRoot(root).render(
  <StrictMode>
    {/* Hash routes work on GitHub Pages, which has no server to rewrite paths. */}
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);
