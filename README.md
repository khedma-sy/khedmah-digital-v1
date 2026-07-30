# Khedmah Digital V1

Khedmah Digital V1 is the official repository for the Khedmah Digital source of truth.

The repository defines the approved foundation and bounded MVP baseline for an Arabic-first business growth platform. It contains governance, product scope, architecture principles, domain contracts, operational expectations, strategic vision, and the currently authorized MVP implementation foundations.

## Repository Purpose

The documentation foundation remains the prerequisite and source of truth. The current implementation boundary is governed by the [Khedmah Digital MVP Definition](docs/product/KHEDMAH-DIGITAL-MVP-DEFINITION.md); no capability outside that document is authorized.

## Source of Truth

- [Platform Constitution](docs/governance/PLATFORM-CONSTITUTION.md)
- [Project Charter](docs/governance/PROJECT-CHARTER.md)
- [V1 Scope](docs/product/V1-SCOPE.md)
- [Khedmah Digital MVP Definition](docs/product/KHEDMAH-DIGITAL-MVP-DEFINITION.md)
- [Reserved Modules](docs/product/RESERVED-MODULES.md)
- [Strategic Blueprint](docs/vision/STRATEGIC-BLUEPRINT.md)
- [System Architecture Overview](docs/architecture/SYSTEM-ARCHITECTURE-OVERVIEW.md)
- [Domain Contracts](docs/contracts/DOMAIN-CONTRACTS.md)
- [Definition of Done](docs/operations/DEFINITION-OF-DONE.md)

## Current Boundary

Runnable backend and frontend foundations exist under `apps/`, alongside canonical contracts and foundations under `backend/`. Their presence does not imply production readiness. Alpha remains blocked until the acceptance criteria and release gates in the MVP definition pass. Reserved and post-MVP modules remain documentation-only.


## Firebase SDK integration

Web and Android use the existing Firebase production project through centralized, environment-only configuration. See the [Firebase SDK integration guide](docs/google/firebase-sdk-integration.md) and [integration report](docs/reports/firebase-sdk-integration-report.md). No Firebase or Google Cloud resource is created by this integration.
