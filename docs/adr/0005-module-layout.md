# ADR 0005: Module layout

## Status

Accepted.

## Context

Several frontend and backend modules grew past 250 lines. Tests import and mock names from the original module paths, and consumers must keep using those paths.

## Decision

Split large modules by responsibility into sibling packages or subfolders. The original module remains the public entry point and re-exports the same names. Patch-sensitive globals and helpers remain defined or resolved through that entry point. Large pages extract state logic into hooks and markup into presentational components while preserving effect order and rendered DOM.

## Consequences

Refactors are behaviour-preserving and verified by the existing suite and coverage gates. New modules are covered because coverage scans all source files. Any split that changes mocks, import identity, DOM, or bundle size is reverted rather than adapted around.
