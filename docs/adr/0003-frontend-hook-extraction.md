# 3. Frontend Hook Extraction

Status: Accepted

Date: 2026-11-23

## Context

Several page components combined data fetching, derived state, event handlers, and large JSX trees in
one file. That made pages hard to test in isolation and pushed logic changes into files whose markup
is asserted directly by DOM-level tests. The pages are the public navigation surface, so their
default exports, visible text, and rendered structure must not move.

## Decision

- Move page state, effects, and actions into hooks under the page folder (for example `useAssistant`,
  `useRoutines`, `usePredictions`, `useWeatherReport`), with controller interfaces describing the
  returned contract.
- Move presentational sections into components beside those hooks; keep the original page file as a
  thin default-export facade that composes them.
- Preserve mount-time loads and effect dependencies as they were. Where the hooks lint rules flag
  intentional timing, use narrow, documented suppressions rather than reordering effects.
- Keep UI text, element hierarchy, accessible names, and API calls unchanged (ADR 0001), and verify
  with the existing page and hook tests.

## Consequences

- Logic can be tested through hooks while page tests continue to assert the same DOM.
- Page files are short and the ownership of each controller is explicit.
- Page facades, hooks, and components must evolve together; changing a controller shape requires
  updating every consumer.
