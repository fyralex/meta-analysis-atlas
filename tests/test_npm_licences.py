"""The npm licence record (scripts/npm_licences.py, issue #35)."""

import json
import pathlib

import npm_licences as nl


def _lock(tmp: pathlib.Path, packages: dict[str, dict[str, object]]) -> pathlib.Path:
    path = tmp / "package-lock.json"
    path.write_text(json.dumps({"lockfileVersion": 3, "packages": {"": {"name": "app"}, **packages}}))
    return path


def test_reads_every_package_with_its_licence_and_use(tmp_path: pathlib.Path) -> None:
    lock = _lock(
        tmp_path,
        {
            "node_modules/react": {"version": "19.3.1", "license": "MIT"},
            "node_modules/a/node_modules/@scope/b": {"version": "1.0.0", "license": "ISC", "dev": True},
        },
    )
    assert nl.packages(lock) == [
        {"name": "@scope/b", "version": "1.0.0", "licence": "ISC", "dev": True},
        {"name": "react", "version": "19.3.1", "licence": "MIT", "dev": False},
    ]


def test_flags_an_app_dependency_with_a_licence_not_gpl_compatible(tmp_path: pathlib.Path) -> None:
    lock = _lock(
        tmp_path,
        {
            "node_modules/ok": {"version": "1", "license": "MIT"},
            "node_modules/bad": {"version": "1", "license": "SSPL-1.0"},
            "node_modules/unknown": {"version": "1"},
            "node_modules/devonly": {"version": "1", "license": "CC-BY-4.0", "dev": True},
        },
    )
    assert [p["name"] for p in nl.not_compatible(nl.packages(lock))] == ["bad", "unknown"]


def test_the_real_lock_has_only_compatible_app_dependencies_and_the_record_lists_them_all() -> None:
    pkgs = nl.packages()
    assert nl.not_compatible(pkgs) == []
    text = nl.render(pkgs)
    for p in pkgs:
        assert f"| `{p['name']}` | {p['version']} |" in text


def test_counts_a_package_installed_twice_once_and_as_the_apps_if_any_copy_is(tmp_path: pathlib.Path) -> None:
    lock = _lock(
        tmp_path,
        {
            "node_modules/a/node_modules/x": {"version": "1", "license": "MIT", "dev": True},
            "node_modules/x": {"version": "1", "license": "MIT"},
            "node_modules/y": {"version": "2", "license": "MIT", "devOptional": True},
        },
    )
    assert nl.packages(lock) == [
        {"name": "x", "version": "1", "licence": "MIT", "dev": False},
        {"name": "y", "version": "2", "licence": "MIT", "dev": False},
    ]


def test_main_writes_the_record_or_fails_without_writing(tmp_path: pathlib.Path) -> None:
    out = tmp_path / "npm-licences.md"
    good = _lock(tmp_path, {"node_modules/ok": {"version": "1", "license": "MIT"}})
    assert nl.main(good, out) == 0
    assert "| `ok` | 1 | MIT |" in out.read_text()
    out.unlink()
    bad = _lock(tmp_path, {"node_modules/bad": {"version": "1", "license": "SSPL-1.0"}})
    assert nl.main(bad, out) == 1
    assert not out.exists()
