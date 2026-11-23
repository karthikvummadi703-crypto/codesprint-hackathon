# 1. Behavior-Preserving Refactor Strategy

Status: Accepted

Date: 2026-11-23

## Context

The codebase contains large frontend pages and backend service modules. They need to be split for
readability, but existing tests import historical module paths, patch module-level names, and assert
on rendered text, DOM structure, prompts, and response shapes. A refactor that changes any of these
would be indistinguishable from a product change and would invalidate the verification suite.

## Decision

- Golden rule: a refactor changes structure only. UI text and DOM, API responses, prompts, config
  thresholds, and tests stay identical. If behavior must change, it is a separate change.
- Facade/re-export pattern: keep the original module path as a thin compatibility surface that
  re-exports the implementation from the new modules. Existing imports and monkeypatch targets keep
  working, including private names where tests rely on them.
- Verification guard: after each step, run `npm run format`, `npm run format:check`, `npm run lint`,
  `npm run typecheck`, `npm test`, `python -m ruff check .` in `backend`, and the backend tests.
  A step is only complete when all guards pass with no test, config, or prompt edits.
- Revert policy: if a guard fails and the cause is not purely structural, revert that step as a
  whole (facade and extracted modules together) instead of patching behavior or weakening checks.
  Keep steps small so a revert is cheap.

## Consequences

- Reviewers can verify structural changes against an unchanged behavioral baseline.
- Compatibility facades add indirection and duplicate export lists that must be maintained.
- Some static-analysis exceptions are retained where the original timing or debt is intentional;
  these are recorded in ADR 0004 rather than treated as behavior changes.
