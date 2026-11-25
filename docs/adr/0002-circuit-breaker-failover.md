# ADR 0002: Circuit breaker and LLM failover

## Status

Accepted.

## Context

The assistant can use several OpenAI-compatible models. A failing or rate-limited provider must not take down the chat endpoint, and repeated whole-chain failures should avoid hammering upstream services.

## Decision

Try the configured model chain in order with per-model timeouts and a shared total budget. A process-local breaker counts consecutive whole-chain failures, opens for a cooldown, and allows a single successful probe to clear itself. Missing keys, empty chains, exhausted budgets, and open circuits degrade without a provider call.

## Consequences

Failover order and budget accounting are observable behaviour and are pinned by the failover tests. Breaker state is process-local and deliberately not persisted. Provider-specific 429 handling avoids retrying the same model while still allowing later models.
