# Khedmah Canonical Backend Foundation

## Current authority

This tree is the canonical, framework-neutral domain and migration foundation.
It is **not** an executable server. The only NestJS bootstrap and production
backend host lives in `apps/backend`.

- `backend/modules`: canonical domain rules and repository contracts;
- `backend/operations`: governed application/domain operation foundations;
- `backend/migrations`: canonical ordered SQL migration lineage;
- `backend/core`, `backend/shared`, and `backend/database`: shared foundations;
- `backend/seeds`: controlled seed data.

Do not add `package.json`, `main.ts`, `app.module.ts`, an HTTP listener, or a
second framework runtime beneath this directory. Runtime integration proceeds
from `apps/backend` through explicit adapters and ports without reversing the
dependency direction.

The historical mission notes below describe the boundary at the time the
foundation was introduced. They are retained as provenance, not as a statement
that the present repository has no implemented runtime features.

## Purpose

This directory is the official backend foundation skeleton for Khedmah Digital V1. It is initialized according to Mission 049 Backend Foundation Architecture Contract and Mission 050 Backend Module Skeleton Governance Contract.

## Mission 051 Boundary

This skeleton contains documentation and folder placeholders only. It does not implement product features, backend source code, API routes, database models, database connections, migrations, authentication code, authorization middleware, services, repositories, frontend code, UI screens, deployment infrastructure, marketplace behavior, payments, commissions, advertising, ranking, social features, AI, or tracking systems.

## Architecture Layers

Future backend implementation must follow this dependency direction:

```text
API
↓
Application
↓
Domain
↓
Repository
↓
Database
```

Rules:

- no business logic is implemented in this skeleton.
- API adapters must not contain business logic.
- API adapters must not access the database directly.
- Application services coordinate future use cases and audit events.
- Domain rules protect ownership, lifecycle, permissions, trust, and verification boundaries.
- Repositories are future persistence abstractions only.
- Database access is not initialized in this mission.

## Approved Structure

```text
backend/
├── modules/
├── core/
├── config/
├── database/
├── shared/
├── tests/
└── migrations/
```

## Module Governance Reference

Approved modules live under `backend/modules/` and are limited to the Mission 050 official V1 module list:

- identity
- users
- profiles
- organizations
- business_profiles
- professional_profiles
- service_catalog
- locations
- trust_verification
- relationships
- audit
- analytics

Every module README documents module responsibility, ownership boundary, allowed dependencies, and forbidden dependencies. No module contains API handlers, services, repositories, schemas, or runtime code in Mission 051.

## Development Rules

- Preserve Arabic-first and RTL-compatible product direction.
- Keep V1 backend structure non-transactional and non-marketplace.
- Do not add runtime code unless a future mission explicitly authorizes it.
- Do not add secrets, credentials, tokens, passwords, production URLs, production values, or private user data.
- Do not add feature modules outside the approved module list without governance approval.

## Security Rules

- Authentication and authorization are future boundaries only.
- No authentication implementation exists here.
- No authorization middleware exists here.
- No database connection exists here.
- No production configuration exists here.
- Future security helpers must remain technical utilities and must not hide business permission logic.

## No-Feature Boundary

There are no API routes, no business logic, no database access, no authentication implementation, and no production configuration in this skeleton.

This backend foundation is a skeleton only. It does not create marketplace modules, payment modules, commission modules, advertising modules, social modules, AI modules, ranking modules, tracking modules, ordering modules, delivery marketplace modules, or production infrastructure.
