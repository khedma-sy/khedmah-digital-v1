# Canonical Authority Model

## Status

**Authority:** Executive Council P0 Directive — Canonical Authority Definition

**Effective:** 2026-07-28

**Scope:** all governance, audit, product, architecture, operations, implementation, release, and verification reports created after this policy takes effect.

This document defines how Khedmah Digital V1 determines authoritative truth. It changes evidence interpretation only; it does not authorize product scope, implementation, migration, API, infrastructure, or release changes.

## Authority Assessment

### Executive Authority

The Executive Council is the highest governance authority. It approves policy, scope, mission authorization, exceptions, and final business or release decisions. An Executive decision governs what the project is authorized to do; it does not replace the technical contents of the canonical repository or fabricate a missing commit, check, or file.

### GitHub Authority

The approved Khedmah Digital GitHub repository and its default `main` branch are the canonical technical repository authority. GitHub records the authoritative branch tip, merge history, Pull Requests, reviews, checks, and hosted repository controls. When GitHub `main` conflicts with a workspace, checkout, `FETCH_HEAD`, or other local Git metadata, GitHub `main` governs repository state.

### Repository Authority

Within the canonical GitHub repository, the tree reachable from the approved `main` commit is authoritative for tracked code, documentation, migrations, configuration, and tests. Merge history and Pull Requests provide provenance in descending order beneath the `main` tree. A file outside that reachable tree is not canonical merely because it exists in a local checkout.

### Workspace Authority

A workspace or checkout is a verification surface, not the source of canonical repository truth. It can prove local content, Git-object integrity, builds, tests, and the exact refs available in that environment. It cannot by itself override GitHub `main` or prove the current hosted branch, PR, review, check, ruleset, or merge state.

### Evidence Scope

Every report must identify the exact evidence scope: Council decision identifiers, GitHub repository and `main` commit when accessible, PR and merge identifiers, local branch and commit, commands executed, files inspected, and observation time. Claims must be limited to the authority level actually observed.

### Verification Limits

Access limitations must be reported as limitations, not defects. If GitHub cannot be reached, the correct status is **Canonical Repository Verification Pending** or **Remote Verification Unavailable**. Absence of remote evidence in a workspace is not evidence that the canonical merge, branch, or repository is defective.

## Authority Hierarchy

The sole approved hierarchy is:

```text
Executive Council
        │
        ▼
GitHub Repository (main)
        │
        ▼
Merge History
        │
        ▼
Pull Requests
        │
        ▼
Workspace / Checkout
        │
        ▼
Codex Analysis
```

Each level may interpret evidence from the level immediately below it, but may not promote lower-level observations over a higher authority. Codex analysis is advisory and must expose its sources and limits.

## Source of Truth Definition

Canonical project truth consists of two coordinated authorities:

1. **Governance truth:** current approved Executive Council decisions.
2. **Technical repository truth:** the tree and state of the approved GitHub repository's `main` branch, interpreted under those decisions.

Merge history explains how content reached `main`; Pull Requests explain review and change provenance. Neither an unmerged PR nor a local commit supersedes the `main` tree. Documentation is authoritative only when reachable from canonical `main` and not superseded by a later Council decision or a newer canonical document.

## Verification Levels

| Level | Required evidence | Permitted statement |
|---|---|---|
| Executive verified | Identified, applicable Council decision | `Verified by Executive Authority` for authorization or policy |
| Canonical repository verified | Direct observation of approved GitHub `main` and exact commit | `Verified by Canonical Repository` |
| Merge verified | Hosted merge record reachable from canonical `main` | `Merge Verified by Canonical Repository` |
| PR verified | Hosted PR record, state, head/base, reviews, checks, and merge linkage | `Pull Request Verified` within those fields |
| Verified locally | Reproducible checkout command or file inspection tied to local commit | `Verified Locally` |
| Pending | Higher authority inaccessible or identity not established | `Canonical Repository Verification Pending` |
| Unavailable | Remote lookup could not be performed in the environment | `Remote Verification Unavailable` |

Local success must never be labelled canonical success without observing the canonical `main` commit. Conversely, canonical verification pending must never be labelled repository failure without affirmative defect evidence.

## Evidence Classification

| Classification | Examples | Authority treatment |
|---|---|---|
| Executive evidence | numbered directive, approved Council resolution | Governs authorization and policy |
| Canonical repository evidence | GitHub `main` SHA/tree, hosted branch configuration | Governs repository state |
| Merge evidence | hosted merge SHA, timestamp, reachability from `main` | Proves merge only when tied to canonical repository |
| PR evidence | PR URL/number, base/head, reviews, checks, merged state | Proves recorded PR facts, not canonical content unless merged |
| Local repository evidence | local refs, commits, tree, `git fsck`, diffs | Proves only the observed checkout |
| Runtime verification evidence | build, tests, health checks, migration inspection | Proves only the executed environment and scope |
| Analytical inference | reconciliation, risk assessment, recommendation | Must be labelled inference and cite underlying evidence |
| Unverified assertion | uncited status, unavailable remote state, historical narrative | Must not be promoted to verified fact |

## Reporting Rules

Every future report must:

1. Include an `Authority Assessment` section with the six subsections defined above.
2. State whether each material conclusion is **Verified Locally**, **Verified by Canonical Repository**, pending, or unavailable.
3. Name the canonical GitHub repository, `main` SHA, PR, and merge SHA when directly observable; otherwise state the access limit without inferring failure.
4. Distinguish Council authorization from technical repository evidence.
5. Prefer current canonical evidence over historical report claims.
6. Cite repository-relative documents and exact commits used as evidence.
7. Separate facts, limitations, risks, and recommendations.
8. Never use workspace state, local Git metadata, or `FETCH_HEAD` to override GitHub `main`.
9. Never describe absence of access as corruption, failed merge, desynchronization, or reconciliation failure.
10. Use `POST-MERGE ISSUES DETECTED` or `REPOSITORY RECONCILIATION REQUIRED` only when affirmative evidence identifies an actual issue.

When the only limitation is unavailable GitHub evidence, use **Canonical Repository Verification Pending** or **Remote Verification Unavailable**.

## Repository Authority Rules

- The Council-approved GitHub repository and `main` are the only canonical technical repository source.
- The canonical commit must be identified by full SHA whenever possible.
- Hosted merge reachability from `main` governs merge status; a local merge-shaped commit or commit subject is supporting evidence only.
- Hosted PR state governs PR status; generated PR metadata and report narratives are not hosted PR evidence.
- Branch protection, rulesets, reviews, and checks require direct GitHub evidence.
- A local checkout may be stale, shallow, detached, rewritten, or disconnected. Its missing refs do not negate canonical refs.
- If canonical GitHub evidence and a local checkout differ, record the local divergence and treat GitHub `main` as authoritative.
- If the approved GitHub repository identity itself is unavailable, request Executive or repository-administrator confirmation and mark canonical verification pending.

## Executive Authority Rules

- The Council authorizes missions, scope, policy, exceptions, acceptance, and release gates.
- Council decisions must be identified and applied in effective-date order; a later explicit decision supersedes a conflicting earlier policy.
- Executive authority may designate the official GitHub repository and default branch.
- A Council statement about a merge is authoritative governance context. Technical details such as SHA, tree, checks, and file presence should still be reconciled against GitHub when accessible.
- Reports must not reinterpret a Council directive to authorize features, APIs, migrations, or infrastructure that it does not explicitly approve.
- A technical inconsistency discovered in canonical `main` must be reported to the Council; it must not be silently corrected during a governance-only mission.

## Workspace Limitations

A workspace can establish:

- its current commit, refs, working-tree state, and tracked files;
- local Git object consistency;
- local builds, tests, static checks, and inspected file contents;
- differences against refs actually present in that workspace.

A workspace cannot establish without direct canonical access:

- the current GitHub `main` tip or default-branch identity;
- hosted PR or merge status;
- approvals, required checks, Actions results, branch protection, or rulesets;
- whether its missing files or refs are also absent from canonical `main`;
- production deployment, applied migrations, or runtime state outside the environment tested.

`FETCH_HEAD`, cached API output, commit subjects, screenshots without repository identity, and historical reports may support an investigation but do not outrank direct GitHub `main` evidence.

## Decision Matrix

| Situation | Classification | Required report language | Prohibited conclusion |
|---|---|---|---|
| GitHub `main` observed and matches checkout | Canonical + local verified | `Verified by Canonical Repository` and `Verified Locally` | none, provided scopes are stated |
| GitHub `main` observed and differs from checkout | Canonical verified; local divergence | GitHub `main` is authoritative; record exact divergence | treating workspace as source of truth |
| GitHub unavailable; local checks pass | Local verified; remote pending | `Verified Locally — Canonical Repository Verification Pending` | declaring canonical merge verified or defective |
| GitHub unavailable because environment has no remote/access | Remote unavailable | `Remote Verification Unavailable` | `POST-MERGE ISSUES DETECTED` solely for missing access |
| Hosted PR says merged and merge is reachable from `main` | Canonical merge verified | `Merge Verified by Canonical Repository` | relying only on local subject text |
| Hosted PR says merged but merge/content is not reachable from `main` | Affirmative inconsistency | identify exact PR, SHA, branch, and observed mismatch | hiding the inconsistency as pending |
| Canonical `main` has missing/corrupt/conflicting required content | Affirmative repository issue | use the applicable issue/reconciliation decision with evidence | describing it as access limitation |
| Council direction conflicts with older repository policy | Executive supersession | apply the later Council direction and record reconciliation needed in canonical docs | applying obsolete local policy |

## Future Governance Policy

- This model is mandatory for all reports issued after its effective date.
- Report templates and future governance documents must link to this model rather than recreate an alternative authority order.
- Historical audits remain evidence of what was observed at their stated time. Their conclusions must be read within their recorded scope and may be superseded by this policy without rewriting history.
- New reports that rely on historical audits must reclassify their claims using the verification levels in this model.
- Governance reviews must check the presence and completeness of `Authority Assessment` before accepting a report.
- The repository administrator must preserve canonical repository identity and authenticated access evidence for auditors.
- Exceptions require an explicit, later Executive Council decision; convenience, local tool limits, or inferred intent are not exceptions.

## Adoption Decision

The [Platform Constitution](PLATFORM-CONSTITUTION.md), [Project Charter](PROJECT-CHARTER.md), [Executive Engineering Directive](EXECUTIVE-ENGINEERING-DIRECTIVE.md), and [Repository Merge Policy](REPOSITORY-MERGE-POLICY.md) must be interpreted through this authority hierarchy. Where an older report treated missing remote access as a repository defect, this model supersedes that interpretation: the proper classification is pending or unavailable unless affirmative issue evidence exists.
