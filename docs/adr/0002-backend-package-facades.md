# 2. Backend Package Facades

Status: Accepted

Date: 2026-11-23

## Context

`services/ai_service.py`, `services/query_router.py`, `services/rag_service.py`, and
`services/air_quality_service.py` had accumulated unrelated responsibilities. Route modules and tests
import from those paths, and tests monkeypatch names such as provider functions and constants where
they are looked up. Replacing the modules outright would break imports and patch targets without any
product benefit.

## Decision

- Split each large service into a package of focused modules:
  - `ai_service/`: prompt text, provider orchestration, offline fallback.
  - `query_router/`: context blocks, document detection, history windows, intent routing.
  - `rag_service/`: indexing, ingestion, storage.
  - `air_quality_service/`: AQI math, providers, service assembly.
- Keep the original `services/<name>.py` files as re-export facades. Re-export the same public and
  private names, keep `__all__`, and preserve shared module objects so existing patches still land
  where the implementation reads them.
- Extract weather helpers and response schemas into sibling modules (`weather_*.py`, `schemas_*.py`)
  without changing their values or response shapes.
- Apply ADR 0001: no route behavior, prompt text, thresholds, or API response field changes.

## Consequences

- Individual modules are small enough to review and lint; complex logic is easier to locate.
- Tests and routes keep their historical imports, so the refactor is verifiable by the existing suite.
- Facade export lists must be updated when new symbols are added, and circular imports between a
  facade and its package must be avoided.
