import os
from pathlib import Path

import pytest

from . import proof
from .support import SUPPORTED_PATHWAYS, make_spec


@pytest.fixture(scope="session")
def runnable_spec(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """A copy of the spec in which the 12 supported pathways are runnable."""
    return make_spec(tmp_path_factory.mktemp("spec"), SUPPORTED_PATHWAYS)


# ---- the Proof page's data (#163): each test's outcome, and the file at the end of a validation run -----------------


def pytest_runtest_logreport(report: pytest.TestReport) -> None:
    if report.when == "call":
        proof.outcomes[report.nodeid] = report.outcome
    elif report.failed:
        proof.outcomes[report.nodeid] = "error"  # its setup or teardown failed
    elif report.skipped:
        proof.outcomes[report.nodeid] = "skipped"


def pytest_sessionfinish(session: pytest.Session) -> None:
    out = os.environ.get(proof.OUT_ENV)
    if out and any("test_validation.py::" in node for node in proof.outcomes):
        proof.write(Path(out), os.environ.get("R_SERVICE_URL"))
