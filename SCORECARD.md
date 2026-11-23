# Scorecard

## Baseline (before changes)

Measured on 2026-11-23 in `codesprint-hackathon` (workspace root; the requested `codesprint-hackathon-main` directory does not exist here).

| Check | Result |
|---|---|
| `npm run format:check` | Not available — script does not exist in `package.json` |
| `npm run lint` | Passed, exit 0 |
| `npm run typecheck` | Passed, exit 0 |
| `npm test` | 5 files, 49 tests passed |
| `npm run build` | Passed; 2430 modules; assets listed below |
| `python -m ruff check .` | Failed, 63 findings |
| `python -m mypy .` | Failed, 29 errors in 13 files |
| `python -m pytest -q` | 1 failed, 240 passed, 9 deselected |

The baseline pytest failure is in `backend/tests/test_security_and_api.py::TestRouteSurface::test_expected_routes_are_registered`. It inspects only top-level `route.path` values; the installed FastAPI/Starlette represents `include_router` entries as nested `_IncludedRouter` objects, so the test sees only the generated docs routes. API behavior itself is unchanged and other route tests pass.

### Baseline frontend bundle sizes

| Asset | Raw | Gzip |
|---|---:|---:|
| `dist/index.html` | 1.62 kB | 0.73 kB |
| `dist/assets/index-BVK5En3n.css` | 35.51 kB | 7.03 kB |
| `dist/assets/carbonConstants-DlCpCgaD.js` | 0.23 kB | 0.21 kB |
| `dist/assets/rolldown-runtime-XKyaHtl9.js` | 0.72 kB | 0.42 kB |
| `dist/assets/Badge-C3XinAI6.js` | 0.88 kB | 0.52 kB |
| `dist/assets/SettingsPage-yauNvTXB.js` | 10.47 kB | 3.60 kB |
| `dist/assets/CarbonFootprintPage-fFqpoShM.js` | 10.85 kB | 3.36 kB |
| `dist/assets/WeatherReportPage-CrsedYVv.js` | 13.13 kB | 3.34 kB |
| `dist/assets/RoutinesPage-BY4A2kmV.js` | 16.72 kB | 5.94 kB |
| `dist/assets/PredictionsPage-Bw0XA21n.js` | 18.18 kB | 5.30 kB |
| `dist/assets/AIAssistantPage-nEK-Adko.js` | 19.98 kB | 6.29 kB |
| `dist/assets/DashboardPage-B10G5lSc.js` | 28.72 kB | 8.40 kB |
| `dist/assets/index-CND-oZd_.js` | 79.07 kB | 22.94 kB |
| `dist/assets/firebase-core-BD8Gc9s1.js` | 80.38 kB | 28.04 kB |
| `dist/assets/firebase-auth-C3evgmVT.js` | 107.64 kB | 32.35 kB |
| `dist/assets/react-PExiK-3_.js` | 227.06 kB | 73.77 kB |
| `dist/assets/firebase-firestore-ERhgnxq4.js` | 394.19 kB | 112.99 kB |
| `dist/assets/charts-Bybbi4jx.js` | 401.72 kB | 114.63 kB |

Total raw JS: 1409.94 kB. Total gzip JS: 422.10 kB.

### Baseline backend coverage

`pytest --cov=. --cov-report=term-missing` reports 82% total including test files (4139 statements, 749 missed). A coverage config omitting `tests/` will be added before enforcement; its measured value will be recorded in the phase results.

### Baseline AI evaluation scores supplied by the user

| Factor | Score |
|---|---:|
| Code Quality | 88 |
| Security | 99 |
| Efficiency | 100 |
| Testing | 81 |
| Accessibility | 98 |
| Problem Statement Alignment | 99 |
| Overall | 94.74 |

## Phase 1 — Testing (complete)

No production source file, API response, route, UI text, or runtime behavior was changed. All additions are tests and tooling.

| Check | Result |
|---|---|
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm test` | 37 files, 419 tests passed |
| `npm run test:coverage` | Passed thresholds |
| `npm run build` | Passed |
| `python -m pytest -q` | 561 passed, 9 deselected |
| Backend coverage | 94.94% (threshold 92%) |

Frontend coverage: statements **91.65%**, branches **82.80%**, functions **88.04%**, lines **93.63%**.

Frontend bundle comparison: every JS chunk has the same raw and gzip sizes as baseline; CSS is 35.24 kB / 6.99 kB gzip because test files are now excluded from Tailwind content scanning (baseline: 35.51 kB / 7.03 kB). No runtime source was changed.

Backend coverage config omits `tests/`, keeps `-m "not live"`, and enforces 92%. CI now runs frontend coverage and backend XML coverage in addition to the existing checks. `Makefile` and `TESTING.md` were added.

The baseline route-surface test was fixed in test-only code: it now reads the OpenAPI schema instead of assuming flat top-level route objects. This reflects the installed FastAPI/Starlette representation without changing API behavior.

### Deferred in Phase 1

- `renderHook` tests for `useAssistant`, `useRoutines`, `usePredictions`, and `useWeatherReport` could not be added because these hooks do not exist yet. They will be extracted in Phase 2 and tested immediately afterward.
- `format:check` is still absent; a formatter check will be added in Phase 2 without changing source semantics.

### Pre-existing issues found by tests and intentionally left unchanged

- Dashboard/Predictions axe violations (`aria-valid-attr-value`, `heading-order`) and AppLayout `landmark-unique` when the mobile dialog is open.
- `aria-expanded` remains hardcoded `false` on the mobile menu button.
- Login/Signup keep the loading state after successful auth while mounted.
- Storage upload can leave its promise pending if `getDownloadURL` rejects.
- Several backend config/rate-limit edge cases behave oddly (invalid limits accepted, `Retry-After` off by one, `IndexError` for non-positive limits).

These were asserted as current behavior to protect functionality rather than fixed, per the golden rule.
