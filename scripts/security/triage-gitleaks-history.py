#!/usr/bin/env python3
"""Classify historical Gitleaks findings locally without ever exposing matched material.

This is a read-only, fail-closed diagnostic. It does not grant exceptions,
revoke keys, change Git history or approve a release.
"""
from __future__ import annotations

from collections import Counter
import json
import hashlib
from pathlib import PurePosixPath
import re
import subprocess
import sys

SHA = re.compile(r"^[a-f0-9]{40}$")
UUID = re.compile(r"^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$", re.I)
WEBP_LINE = re.compile(r"^\s*['\"]([A-Za-z0-9+/=]{72,})['\"]\s*,?\s*$")
# Some historical lines include long JS base64 chunks in a static image array.

def history_line(record: dict) -> tuple[str, str | None]:
    commit = record.get("Commit")
    filename = record.get("File")
    number = record.get("StartLine")
    if not isinstance(commit, str) or not SHA.fullmatch(commit):
        return "", None
    if not isinstance(filename, str):
        return "", None
    filename = filename.removeprefix("/repo/")
    path = PurePosixPath(filename)
    if path.is_absolute() or ".." in path.parts or not filename:
        return "", None
    if not isinstance(number, int) or number < 1:
        return filename, None
    # Never emit git-show stdout, stderr, source lines or the failing path.
    result = subprocess.run(
        ["git", "show", "--no-ext-diff", f"{commit}:{filename}"],
        capture_output=True,
        timeout=15,
        check=False,
    )
    if result.returncode:
        return filename, None
    lines = result.stdout.decode("utf-8", errors="replace").splitlines()
    return filename, lines[number - 1] if number <= len(lines) else None

def classify(filename: str, line: str | None) -> str:
    if line is None:
        return "unresolved_history_context"
    if filename == "apps/frontend/lib/brand-hero-image.ts" and WEBP_LINE.fullmatch(line):
        return "candidate_static_webp_data"
    if filename in {
        "scripts/stage-preview-v2-maps-config.py",
        "scripts/stage-preview-v2-firebase-server-config.py",
    }:
        match = re.fullmatch(r"\s*KEY_UID\s*=\s*['\"]([^'\"]+)['\"]\s*", line)
        if match and UUID.fullmatch(match.group(1)):
            return "candidate_google_resource_uuid"
    if filename.endswith(".test.ts") and "fulfillment_cancellations_24h" in line:
        return "candidate_test_metric_name"
    if filename == "docs/project-control/CURRENT-STATE.md":
        # A public Git commit SHA is not a credential. Accept as a *candidate*
        # only when a full 40-hex reference is in an explicit commit context.
        if re.search(r"\\b[0-9a-f]{40}\\b", line, re.I) and re.search(
            r"commit|revision|git(?:hub)?[./]|\\bsha\\b", line, re.I
        ):
            return "candidate_git_commit_reference"

    return "unresolved_requires_private_review"

def main() -> int:
    if len(sys.argv) != 2:
        return 2
    try:
        with open(sys.argv[1], encoding="utf-8") as stream:
            findings = json.load(stream)
        if not isinstance(findings, list):
            raise ValueError("non-list Gitleaks report")
        counts: Counter[str] = Counter()
        for record in findings:
            if not isinstance(record, dict):
                raise ValueError("malformed Gitleaks record")
            name, line = history_line(record)
            category = classify(name, line)
            counts[category] += 1
            if category.startswith("unresolved_"):
                area = (
                    "application" if name.startswith(("apps/", "backend/")) else
                    "infrastructure" if name.startswith(("scripts/", ".github/", "cloudbuild")) else
                    "documentation" if name.startswith(("docs/",)) else
                    "test_or_fixture" if name.startswith(("tests/",)) or name.endswith(".test.ts") else
                    "other"
                )
                # One-way source identifier; no full path, line, commit or match.
                identifier = hashlib.sha256(name.encode()).hexdigest()[:16]
                raw = line or ""
                hint = (
                    "google_api_key_format" if re.search(r"AIza[A-Za-z0-9_-]{25,}", raw) else
                    "apparent_assignment" if re.search(r"(?:key|token|secret|password)\s*[:=]", raw, re.I) else
                    "high_entropy_source_text" if re.search(r"[A-Za-z0-9+/=_-]{45,}", raw) else
                    "other_source_text"
                )
                print(f"HISTORICAL_UNRESOLVED_AREA={area}")
                print(f"HISTORICAL_UNRESOLVED_SOURCE_ID={identifier}")
                print(f"HISTORICAL_UNRESOLVED_PATTERN={hint}")
        print("HISTORICAL_TRIAGE_TOTAL=" + str(sum(counts.values())))
        for category, count in sorted(counts.items()):
            print(f"HISTORICAL_TRIAGE_{category.upper()}={count}")
        # Classification is informational only. Gitleaks remains the blocking gate.
        return 0
    except Exception:
        print("HISTORICAL_TRIAGE_FAILED_CLOSED=1")
        return 2

if __name__ == "__main__":
    raise SystemExit(main())
