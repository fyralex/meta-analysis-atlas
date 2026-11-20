"""The generator of frontend/src/types/api.ts (#164)."""

import api_types


def test_the_committed_types_are_current() -> None:
    assert api_types.main(["--check"]) == 0


def test_json_schema_nodes_become_typescript() -> None:
    t = api_types.ts_type
    assert t({"$ref": "#/components/schemas/PathwayRef"}) == "PathwayRef"
    assert t({"anyOf": [{"type": "number"}, {"type": "null"}]}) == "number | null"
    assert t({"enum": ["z", "knha"]}) == '"z" | "knha"'
    assert t({"type": "array", "items": {"type": "string"}}) == "Array<string>"
    assert t({"type": "object", "additionalProperties": {"type": "number"}}) == "Record<string, number>"
    assert t({"type": "object", "additionalProperties": True}) == "Record<string, unknown>"
    assert t({}) == "unknown"


def test_every_backend_model_is_exported() -> None:
    text = api_types.render(api_types.schema())
    for name in ("RunRequest", "RunResponse", "ErrorBody", "DataSpec", "ImportResult", "Example", "Funnel"):
        assert f"export interface {name} {{" in text
