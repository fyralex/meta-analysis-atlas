"""Settings, read from environment variables. Nothing here is secret."""

import os
from dataclasses import dataclass, field
from pathlib import Path

# backend/app/config.py -> the repository's spec/ directory
DEFAULT_SPEC_DIR = Path(__file__).resolve().parents[2] / "spec"
# backend/app/config.py -> backend/examples (#162); the Docker image copies it to /app/examples, the same place
DEFAULT_EXAMPLES_DIR = Path(__file__).resolve().parents[1] / "examples"


def _origins(value: str) -> list[str]:
    return [o.strip() for o in value.split(",") if o.strip()]


@dataclass(frozen=True)
class Settings:
    # where map.json and cards.json are; the Docker image copies them to /app/spec
    spec_dir: Path = DEFAULT_SPEC_DIR
    # the published example datasets: Casebook's and the validation tests'
    examples_dir: Path = DEFAULT_EXAMPLES_DIR
    # the R service's base URL (r_service/run.R listens on 8000 by default)
    r_service_url: str = "http://localhost:8000"
    # origins allowed to call the API from a browser; empty means none (the frontend's nginx proxies /api)
    cors_origins: list[str] = field(default_factory=list)

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            spec_dir=Path(os.environ.get("ATLAS_SPEC_DIR", str(DEFAULT_SPEC_DIR))),
            examples_dir=Path(os.environ.get("ATLAS_EXAMPLES_DIR", str(DEFAULT_EXAMPLES_DIR))),
            r_service_url=os.environ.get("R_SERVICE_URL", "http://localhost:8000").rstrip("/"),
            cors_origins=_origins(os.environ.get("ATLAS_CORS_ORIGINS", "")),
        )
