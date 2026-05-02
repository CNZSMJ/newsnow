# Domain Docs

This repo uses a single-context domain layout.

## Required reading order

Before engineering skills propose domain, architecture, event-engine, API, or investor-surface changes, read:

1. `AGENTS.md`
2. `docs/README.md`
3. `docs/product-direction.md`
4. `docs/architecture.md`
5. `docs/api-contract.md`
6. The relevant `docs/backlog/*` or `docs/hotfix/*` topic when the work belongs to an active topic

## Domain boundary

`newsnow` is an investment-oriented event system. The backend event engine is the source of truth for canonical events, structured facts, evidence linkage, entity and market linkage, and investment semantics.

Frontend and agent interfaces are projections. They may change presentation, schema shape, verbosity, and filtering defaults, but must not independently reclassify events or recompute investment meaning.

## ADRs and unresolved decisions

This repo currently does not use `docs/adr/` as its decision record. Use the current effective docs plus active backlog/hotfix topic documents instead.

Do not write unsettled decisions into current effective docs. If a point is still under discussion, record it only in the relevant backlog topic's `research.md`.
