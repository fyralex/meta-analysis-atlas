from pathlib import Path

import pytest

from .support import SUPPORTED_PATHWAYS, make_spec


@pytest.fixture(scope="session")
def runnable_spec(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """A copy of the spec in which the 12 supported pathways are runnable."""
    return make_spec(tmp_path_factory.mktemp("spec"), SUPPORTED_PATHWAYS)
