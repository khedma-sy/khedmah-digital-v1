#!/usr/bin/env python3
"""Classify the past lab Secret Manager failure from local gcloud logs.

Read-only: no Google Cloud commands, network calls, or log content is printed.
Only the exact transition-secret command is considered; findings are clues,
not proof of a Cloud IAM decision. An absent log does not imply success.
"""
import datetime
import os
from pathlib import Path
import re

COMMAND = "gcloud.secrets.add-iam-policy-binding"
SECRET = "khedmah-lab-transition-sql"
PROJECT = "khedmah-restore-lab-20261112"
LAB_PRINCIPAL = "khedmah-lab-transition@" + PROJECT + ".iam.gserviceaccount.com"
MAX_FILES = 4000
MAX_BYTES = 2_000_000

PATTERNS = {
    "SERVICE_ACCOUNT_MISSING": r"(?:service\s*account|serviceaccount|principal|member)[^\n]{0,250}(?:does not exist|not found|doesn't exist)",
    "EXACT_LAB_ACCOUNT_MISSING": (r"service\s*account\s+['\"\[]?" +
                                  re.escape(LAB_PRINCIPAL) +
                                  r"['\"\]]?\s+(?:does not exist|not found)"),
    "PERMISSION_DENIED": r"permission.denied|does not have permission|access denied|\bforbidden\b|\b403\b",
    "ORG_POLICY": r"organization(?:al)? policy|orgpolicy|org.policy|allowedpolicymemberdomains|constraints/iam",
    "INVALID_ARGUMENT": r"invalid.argument|unrecognized arguments|too few arguments|required arguments",
    "NOT_FOUND_OR_MISSING": r"\bnot.found\b|does not exist|doesn't exist",
    "AUTHENTICATION": r"unauthenticated|invalid_grant|reauthentication|credentials? (?:have )?expired",
    "TRANSIENT_OR_QUOTA": r"timed? ?out|deadline.exceeded|connection (?:refused|reset)|resource.exhausted|\b(?:429|500|502|503|504)\b",
    "ETAG_OR_CONDITION": r"\betag\b|condition required|\baborted\b|\b409\b",
}


def inspect_log(text):
    """Return fixed-label hints only. None of the input is returned."""
    if COMMAND not in text or SECRET not in text:
        return None
    errors = [m.start() for m in re.finditer(r"\bERROR\b|Traceback \(most recent call last\)", text, re.I)]
    if not errors:
        return None
    # Logs can contain sensitive input; match in memory, never display text.
    error_text = text[errors[0]:]
    return {
        "PROJECT_MARKER_PRESENT": PROJECT in text,
        **{name: bool(re.search(pattern, error_text, re.I))
           for name, pattern in PATTERNS.items()},
    }


def classify(directory):
    try:
        files = [p for p in directory.rglob("*.log") if p.is_file()]
        files.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    except OSError:
        return "LOG_DIRECTORY_UNAVAILABLE", None, None
    for path in files[:MAX_FILES]:
        try:
            metadata = path.stat()
            if metadata.st_size > MAX_BYTES:
                continue
            result = inspect_log(path.read_text(encoding="utf-8", errors="replace"))
            if result is not None:
                when = datetime.datetime.fromtimestamp(metadata.st_mtime, datetime.timezone.utc)
                return "MATCHING_FAILED_LOG_FOUND", when.strftime("%Y-%m-%dT%H:%M:%SZ"), result
        except OSError:
            continue
    return "NO_MATCHING_FAILED_LOG", None, None


def main():
    config = Path(os.environ.get("CLOUDSDK_CONFIG") or (Path.home() / ".config/gcloud")).expanduser()
    state, modified, result = classify(config / "logs")
    print("LOG_DIAGNOSIS_STATUS:", state)
    if result is not None:
        print("LOG_MODIFIED_UTC:", modified)
        for name, value in result.items():
            print(name + ":", value)
    print("RAW_LOG_OR_SECRET_PRINTED: False")
    print("CLOUD_CALLS_OR_MUTATIONS: False")


if __name__ == "__main__":
    main()
