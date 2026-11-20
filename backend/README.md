# Backend

The API for v0.2 (FastAPI, Python 3.11). It reads the generated map in `spec/`
and holds no rules of its own: `spec/build_map.py` decides what is valid.

| Method | Path | Returns |
|---|---|---|
| GET | `/health` | `status`, whether the R service answers (`r_service`), whether the advisor is on (`advisor`) |
| GET | `/api/v1/map` | the tiers, sources, branches, rules, cross-cutting sections, metrics, methods and cards |
| GET | `/api/v1/pathways` | `count` and `pathways`; filter by any tier (`framework`, `group`, `datatype`, `outcome`, `model`, `method`, `metric`, each written as in the map) and by `status` |

Errors are JSON: `{"code": ..., "message": ..., "fields": [{"path": ..., "message": ...}]}`.
A filter value the map doesn't have is `422 unknown_value`; a malformed request is
`422 invalid_request`. The OpenAPI schema is at `/openapi.json`.

## Settings

| Variable | Default | |
|---|---|---|
| `ATLAS_SPEC_DIR` | the repository's `spec/` | where `map.json` and `cards.json` are |
| `R_SERVICE_URL` | `http://localhost:8000` | the R service (`r_service/`) |
| `ATLAS_CORS_ORIGINS` | none | comma-separated origins allowed to call the API from a browser |

## Running it

```bash
.venv/bin/uvicorn app.main:app --app-dir backend --port 8080
docker compose up --build        # with the apps and the R service, at http://localhost:8080
```

Its tests run with the map's: `.venv/bin/pytest` (and `scripts/check.sh`).
