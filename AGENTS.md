# AGENTS.md

## Purpose

This repository builds an investment-oriented event system.

The system must be optimized for real investment use, not for generic news browsing and not for exposing event-engine internals.

All future work must preserve the architectural and product intent below.

## Core invariants

### 1. The backend event engine is the single source of truth

The backend event engine is:

- the single source of truth for canonical events
- the single source of truth for structured facts
- the single source of truth for evidence linkage
- the single source of truth for entity and market linkage
- the single source of truth for investment semantics

Investment semantics include:

- event family
- directional view
- materiality
- tradability
- authority
- impact interpretation
- what to watch next

These must be computed once in the backend and consumed everywhere else.

### 2. Frontend and agent interfaces are projections, not independent logic layers

Frontend investor views and agent-facing interfaces may present the same event truth differently, but they must not invent their own business logic.

Allowed differences:

- presentation
- schema shape
- verbosity
- filtering defaults

Not allowed:

- reclassifying events independently
- recomputing investment meaning independently
- inventing separate directional or importance logic
- exposing raw engine/debug terminology as the default user contract

### 3. Frontend is for investors

The human-facing frontend must be optimized for investor decision support.

It should prioritize:

- readability
- scanability
- investment meaning
- affected markets and entities
- evidence clarity
- what matters next

It should not default to:

- engine lifecycle jargon
- parser or resolver internals
- opaque codes or internal fact labels

### 4. Agent interfaces must be structured and auditable

Agent-facing outputs must include:

- investment interpretation
- structured facts
- evidence trail

Agents must not be forced to reconstruct event meaning from raw provider fields or free-form text summaries.

### 5. `newsnow` is an event provider, not the final public MCP boundary

Within the broader architecture:

- `newsnow` owns event collection, normalization, facts, evidence, merging, and impact logic
- `nexus-fi-mcp` is the final public agent abstraction layer

Therefore:

- `newsnow` should expose a strong provider-facing event contract
- public agent contracts should be normalized at the NexusFi MCP layer

`newsnow`'s own MCP server may exist for local debugging or provider use, but it must not be treated as the canonical public contract for all downstream agents.

### 6. Do not move core investment semantics out of the repo

Core event meaning must remain inside this repository.

Do not move or duplicate investment classification logic into:

- frontend pages
- external skills
- downstream prompt templates
- MCP text formatting helpers

Those layers may consume, filter, and present event semantics, but must not become the source of those semantics.

## Product intent

The target user is a serious investor or investment manager.

Every event feature should be evaluated by asking:

1. Does this improve decision quality?
2. Does this help identify what matters now?
3. Does this help distinguish signal from noise?
4. Does this preserve evidence and auditability?
5. Does this reduce ambiguity instead of adding internal system jargon?

If a change makes the system more debug-friendly but less decision-useful, it is moving in the wrong direction unless it is explicitly an internal-only debug surface.

## Scope boundary

When working from this repository, keep the implementation focus here:

- `shared/`
- `server/`
- `src/`
- `docs/`

Do not push core event-engine responsibilities into external skill repositories or workflow wrappers.

## Documentation rule

Any task that reads, writes, reorganizes, creates, updates, archives, or otherwise changes repository documentation must begin by reading:

- [docs/README.md](./docs/README.md)

Treat `docs/README.md` as the entrypoint for document roles, lifecycle, and current documentation governance before touching any file under `docs/`.

Do not write unsettled or not-yet-agreed content into current-effective documentation.
If a point is still under discussion, it may only be recorded in the relevant backlog topic's `research.md` until consensus is reached.

## Service operations

For this repository, all routine service lifecycle actions must use `./scripts/service.sh`.

Use:

- `./scripts/service.sh start`
- `./scripts/service.sh stop`
- `./scripts/service.sh restart`
- `./scripts/service.sh status`
- `./scripts/service.sh logs`
- `./scripts/service.sh build-start`
- `./scripts/service.sh launchd-install`
- `./scripts/service.sh launchd-uninstall`

Do not use ad-hoc start/stop commands such as `pnpm start`, `node dist/output/server/index.mjs`, or manual backgrounding for normal service management when the intent is to run, stop, restart, inspect, or rebuild the local service.

On macOS, once `launchd-install` has been executed, the same `start` / `stop` / `restart` / `status` / `build-start` commands above should remain the only routine interface and will delegate to the installed `launchd` job.

## Reference documents

- [docs/README.md](./docs/README.md)
- [docs/product-direction.md](./docs/product-direction.md)
- [docs/roadmap.md](./docs/roadmap.md)
- [docs/architecture.md](./docs/architecture.md)
- [docs/api-contract.md](./docs/api-contract.md)
- [docs/event-operations-runbook.md](./docs/event-operations-runbook.md)
