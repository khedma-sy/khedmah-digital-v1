# Codex Integration Guide

## Overview
This repository is configured to work with the Codex/GitHub Copilot Agent system for automated task management and implementation tracking.

## Branch Naming Convention
Branches created by Codex follow this naming pattern:
```
codex/<task-description>-<task-id>
```

Example: `codex/implement-audit-module-foundation-9sysew`

## Pull Request Workflow

### 1. Codex Task Creation
- A task is created in the Codex system
- A corresponding branch is created with the `codex/` prefix
- Work is implemented on this branch

### 2. PR Creation
- A Pull Request is opened from the Codex branch to `main`
- PR description includes a link to the Codex Task
- Format: `[Codex Task](https://chatgpt.com/codex/cloud/tasks/task_XXX)`

### 3. Automated Checks
The following workflows run automatically:

#### Test & Verify Workflow
- Secret scanning (no hardcoded credentials)
- Build verification
- Test suite execution
- Security audit
- Code quality checks

#### Database Migration Check (if applicable)
- Migration structure validation
- Rollback file verification
- Forbidden pattern detection
- Schema requirement validation
- Repository implementation checks

#### PR Validation
- Codex branch detection
- PR metadata verification

### 4. Code Review
- CODEOWNERS file triggers automatic reviewer assignments
- Manual review of code changes
- Verification of test coverage
- Security compliance check

### 5. Merge
- Ensure all checks pass
- Squash merge recommended for clean history
- Delete branch after merge

## Status Indicators

| Status | Meaning |
|--------|----------|
| ✅ Passing | All checks successful |
| 🟡 Pending | Checks in progress |
| ❌ Failing | One or more checks failed |
| ⏸️ Draft | PR not ready for review |

## Security Requirements

All PRs must satisfy:
- ✅ No hardcoded secrets, passwords, or API keys
- ✅ No sensitive credentials exposed
- ✅ Compliance with KILL CRITICAL boundaries
- ✅ Database constraints properly defined
- ✅ Input validation implemented
- ✅ Error handling using KhedmahCoreError

## Troubleshooting

### Workflow Failures

**Issue**: Node.js CI fails with "Dependencies lock file not found"
- **Solution**: Ensure `package-lock.json` is committed to the repository

**Issue**: Tests fail during PR
- **Solution**: Run `npm run test:all` locally before pushing

**Issue**: Secret scan detects keywords
- **Solution**: Review the flagged lines and ensure they are not actual secrets

## Links

- [GitHub Workflows Documentation](https://docs.github.com/en/actions)
- [Codex Task Format](https://chatgpt.com/codex/cloud/tasks/)
- [Repository Security Policy](./SECURITY.md)
