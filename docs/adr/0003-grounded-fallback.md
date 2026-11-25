# ADR 0003: Grounded fallback answers

## Status

Accepted.

## Context

The app must remain useful without an LLM key and when providers fail. Answers need to distinguish measured readings from estimates and must not claim unavailable data.

## Decision

When the LLM chain is unavailable, select an intent-specific grounded branch from the already-built prompt context. Each branch reuses the same section parser, band labels, advisory strings, and honesty rules as the prompt path, including explicit phrases for missing readings.

## Consequences

Fallback output is deterministic and directly asserts the current context. The fallback is intentionally separate from the prompt builder so prompt-only refinements cannot silently change honesty wording. Existing quirks in branch wording and document handling are preserved by tests.
