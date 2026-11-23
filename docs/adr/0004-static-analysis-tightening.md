# 4. Static Analysis Tightening

Status: Accepted

Date: 2026-11-23

## Context

The structural refactor needed automated guards against common regressions: unchecked array access,
implicit `any`, hook dependency mistakes, complex new functions, inconsistent Python style, and
drifting formatting. Without enforceable checks, ADR 0001 would rely on manual review only.

## Decision

- ESLint enables the `react-hooks` recommended rules and treats `@typescript-eslint/no-explicit-any`
  as an error for all TypeScript files.
- `tsconfig.json` enables `noUncheckedIndexedAccess` so possibly-missing elements are handled
  explicitly.
- `backend/pyproject.toml` configures Ruff with families `E`, `W`, `F`, `I`, `UP`, `B`, `C4`, `PT`,
  `ASYNC`, `PERF`, `RUF`, `ARG`, `S`, `C90`, `BLE`, `DTZ`, `FLY`, and `ISC`, with
  `max-complexity = 10`. Per-file ignores cover pytest fixtures, facade re-exports, and one fixed
  certificate URL; `E501` and `S101` remain ignored for existing test/style debt.
- Mypy is configured for source files only (`api`, `services`, and top-level backend modules), with
  typed definitions, strict equality, unused-ignore and redundant-cast checks, and missing-import
  allowances for third-party SDKs. Tests are excluded.
- Prettier settings and `npm run format:check` make formatting a verifiable gate; `npm run format`
  applies it before verification.

## Consequences

- Regressions are caught locally and can be enforced in CI without changing runtime behavior.
- Existing intentional patterns need narrow suppressions (hook effect timing, long lines, pytest
  signatures); these do not weaken the default rules elsewhere.
- Raising complexity or adding `any` now requires either a real fix or an explicit, reviewable
  exception.
