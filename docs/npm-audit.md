# npm advisories left open

Checked 2026-11-17 with `npm audit` in `frontend/` (issue #35). Every advisory
is in a tool used only to build and test the app: `npm audit --omit=dev`
reports none, so nothing reaches the published site. Issue #35 takes a fix
only once its release is at least two weeks old.

`npm audit` flags 14 packages (7 high, 7 moderate), from two advisories:

| Advisory | Severity | Reaches us through | Why it is still open | Revisit |
|---|---|---|---|---|
| [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf): `picomatch` up to 4.0.7, ReDoS with repeated extglobs | high | `vite`, `vitest`, `tinyglobby`, `fdir`, `@vitejs/plugin-react`, `@typescript-eslint/typescript-estree` | No fixed release exists: 4.0.7 (2026-08-24) is the latest. npm's suggested fix downgrades Vite to 6 and Vitest to 3, a step back of two major versions, which we don't take. The patterns matched are this repository's own build and test settings, not user input. | When a `picomatch` release above 4.0.7 is two weeks old |
| [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249): `minimatch` 7.0.0 to below 11.0.1, denial of service through glob expansion | moderate | `eslint` 10.14.0, `typescript-eslint` 8.72.1 | Fixed in `eslint` 10.15.0 (2026-11-13) and `typescript-eslint` 8.73.0 (2026-11-16), both under two weeks old today. | Upgrade `eslint` from 2026-11-27 and `typescript-eslint` from 2026-11-30. The `typescript-eslint` packages stay flagged after that, through `picomatch`, until it is fixed. |

Update this file whenever `npm audit` changes, and remove an advisory once it
is fixed.
