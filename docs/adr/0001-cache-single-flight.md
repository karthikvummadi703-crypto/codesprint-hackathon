# ADR 0001: Per-key single-flight cache

## Status

Accepted.

## Context

Provider calls are slow and rate-limited. One early cache implementation used a single global lock, which serialized unrelated locations and made concurrent carbon geocoding impossible. A later invalidation bug let an in-flight fetch repopulate a location prefix after refresh.

## Decision

Keep a short-lived in-memory GET cache keyed by the fully shaped request, with one in-flight promise per key. Refresh requests bypass both cache and stale in-flight entries. Each invalidation increments a generation counter so older fetches cannot write back.

## Consequences

Different keys proceed concurrently; identical concurrent requests share one upstream call. Cache state is process-local and intentionally ephemeral. Cache keys remain shaped rather than canonical raw-provider URLs to avoid earlier list/dict collisions.
