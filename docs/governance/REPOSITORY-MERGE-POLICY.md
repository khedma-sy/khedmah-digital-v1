# Repository Merge Policy

## Status

This policy defines the council-required merge posture for the authoritative repository. It does not prove that the hosting platform currently enforces the settings; platform enforcement must be verified separately.

## Protected Branch

The authoritative default branch selected by the repository administrator must:

- Reject direct pushes except an explicitly approved break-glass action.
- Require a pull request before merging.
- Require at least one approval from a reviewer other than the latest change author.
- Require code-owner review for paths covered by `CODEOWNERS`.
- Dismiss stale approvals when new commits are pushed.
- Require all conversations to be resolved.
- Require the council-approved status checks.
- Reject force pushes and branch deletion.

## Required Status Checks

The branch ruleset should require the exact successful job names emitted by the active workflows, at minimum:

- `Node.js CI / build (20.x)`.
- `Khedmah - Test & Verify / Run Tests & Verification (20.x)`.
- `Khedmah - Test & Verify / Code Quality Checks`.
- `Khedmah - Test & Verify / PR Validation` for pull requests.
- `Database Migration Validation / Validate Migration Files` when its path filter applies.

Required-check names must be copied from an actual successful Actions run; the administrator must not infer names solely from this document.

## Merge Strategy

- Use squash merge for ordinary pull requests so the default branch receives one reviewed change unit.
- Delete the source branch after a verified merge.
- Do not merge when a required or path-applicable check is skipped unexpectedly, pending, cancelled, or failing.
- Do not bypass required reviews or checks to close a mission.
- A merge approval recorded in a report is advisory until the hosting platform records the merge SHA.

## Post-Merge Verification

After merge, the mission owner must record:

1. Pull request number and URL.
2. Reviewer approvals and unresolved-conversation count.
3. Required check names and conclusions.
4. Merge method, merge commit SHA, and timestamp.
5. `git fetch --prune` evidence and comparison with the authoritative branch.
6. Council KPI reconciliation on the merged SHA.

Without this evidence, the mission may be technically complete but remains open under repository governance.

## Administrative Action Required

The repository administrator must choose the authoritative remote and default branch, configure the hosting-platform ruleset to match this policy, and provide authenticated evidence. This repository document cannot perform or prove those administrative actions.
