# Testing

The project uses Vitest for frontend tests and pytest for backend tests. All tests are deterministic: network access, Firebase, filesystem persistence, randomness, and clocks are mocked or frozen where needed. Live-provider smoke tests are opt-in with `pytest -m live`.

## Commands

| Command | Purpose |
| --- | --- |
| `npm test` | Run frontend unit, component, page, hook, service, accessibility, and property tests once |
| `npm run test:watch` | Run frontend tests in watch mode |
| `npm run test:coverage` | Run frontend tests with V8 coverage and enforced thresholds |
| `npm run test:backend` | Run backend pytest suite |
| `python -m pytest -q` | Run backend tests with coverage enforcement |
| `python -m pytest -q --no-cov` | Run backend tests without coverage instrumentation |
| `make all` | Run all checks and both coverage suites |

## Frontend coverage thresholds

Enforced in `vite.config.ts` for every `npm run test:coverage` run:

- Statements: 85%
- Lines: 85%
- Branches: 80%
- Functions: 85%

All runtime source files under `src/` are included. Only test files, test setup, and ambient type declarations are excluded.

## Backend coverage thresholds

Enforced in `backend/pytest.ini` and `backend/.coveragerc`:

- Coverage source: all backend application modules
- Test files omitted from coverage measurement
- Minimum total coverage: 92%
- Live tests remain deselected by default with `-m "not live"`

## Test structure

- `src/services/__tests__/`: API clients, persistence, auth, storage, image processing, and fast-check properties
- `src/pages/__tests__/`: page-level behavior and jest-axe checks
- `src/components/__tests__/`: components, layout, charts, and accessibility checks
- `src/context/__tests__/`: auth and location provider behavior
- `src/__tests__/App.test.tsx`: route guards and application routing
- `backend/tests/`: routers, config, security, AI behavior, Hypothesis properties, and low-coverage branches

## Accessibility checks

Every rendered page and component test runs `jest-axe`. Pre-existing violations are documented in `SCORECARD.md` and asserted explicitly so they cannot silently worsen.
