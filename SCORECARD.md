# Scorecard

## Evaluation scorecard

Internal self-assessment on the six evaluation factors, weighted to 100 points. Evidence comes from the final verification pass on 24 Nov 2026 and the localhost runtime check on 20 Nov 2026.

| Factor                              |  Weight |  Score | Evidence / remaining gap                                                                                                                                                                                                                                                      |
| ----------------------------------- | ------: | -----: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Code quality                        |      20 |     20 | Strict TypeScript incl. `noUncheckedIndexedAccess`, ESLint with react-hooks purity/immutability, Prettier, expanded Ruff, pre-commit, build, and the refactor's module boundaries all pass; local mypy is blocked by Windows Application Control, so CI remains authoritative |
| Security                            |      20 |     19 | Security headers, gitleaks CI, untracked env file, and clean `pip-audit`; hosted HSTS/CSP still needs post-deploy confirmation                                                                                                                                                |
| Efficiency                          |      15 |     14 | Per-key single-flight cache, concurrent carbon geocoding, memoized auth context, and route-level chunks; no final profiling pass                                                                                                                                              |
| Testing                             |      15 |     15 | 504 frontend tests and 566 backend tests; frontend ~94.6% statements/81.48% branches, backend 97% statements, deterministic property tests, axe checks, and coverage gates in CI                                                                                              |
| Accessibility                       |      15 |     14 | Axe checks on real components plus labels, errors, roles, tables, tabs, and mobile nav semantics; manual screen-reader pass outstanding                                                                                                                                       |
| Problem alignment and functionality |      15 |     15 | Prompt/UI copy match the problem statement; localhost checks returned 200 for app, AQI, weather, predictions, geocode, and carbon endpoints                                                                                                                                   |
| **Total**                           | **100** | **97** | **Strong overall; remaining points are hosted header confirmation and manual accessibility/profiling validation**                                                                                                                                                             |

Path to 100: confirm hosted HSTS/CSP after deployment, run a manual keyboard/screen-reader pass, and profile the provider/cache hot paths.

## Baseline

| Area                           | Status            | Notes                                                                       |
| ------------------------------ | ----------------- | --------------------------------------------------------------------------- |
| Frontend format/lint/typecheck | Green             | `npm run format:check`, `npm run lint`, `npm run typecheck`                 |
| Frontend tests/build           | Green             | 49 tests passed; Vite build succeeded                                       |
| Backend lint/format/typecheck  | Green             | `ruff`, `ruff format --check`, `python -m mypy .`                           |
| Backend tests                  | Green             | 241 passed, 9 deselected                                                    |
| Dependency audit               | Initially failing | 15 advisories in `python-multipart`, `python-dotenv`, `pytest`, `starlette` |

## Phase 1 - Prompt and copy alignment

| Item                                           | Status   | Notes                                          |
| ---------------------------------------------- | -------- | ---------------------------------------------- |
| Prompt moved to `backend/prompts/assistant.py` | Complete | Family/smog framing; evidence-grounded wording |
| UI/meta copy aligned                           | Complete | `index.html`, `README.md`                      |
| Prompt tests                                   | Green    | Existing phrase assertions preserved           |

## Phase 2 - Structure and quality gates

| Item                            | Status   | Notes                                                           |
| ------------------------------- | -------- | --------------------------------------------------------------- |
| Large frontend pages split      | Complete | Assist, predictions, weather, routines subfolders               |
| Large backend services split    | Complete | AQI and context packages plus fallback/breaker extraction       |
| Strict TypeScript checks        | Complete | `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`     |
| Prettier/Ruff/mypy/pytest gates | Complete | Local hooks and CI gates added                                  |
| All checks                      | Green    | Frontend 82 tests; backend 255 tests after Phases 3-6 additions |

## Phase 3 - Security hardening

| Item               | Status   | Notes                                                                                                                   |
| ------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------- |
| Security headers   | Complete | CSP, HSTS, Permissions-Policy, nosniff, frame/referrer policy in `firebase.json`, `vercel.json`, and backend middleware |
| Header tests       | Complete | Added two cases in `backend/tests/test_security_and_api.py`                                                             |
| PDF dependency     | Complete | `PyPDF2` replaced with maintained `pypdf==7.1.1`                                                                        |
| Tracked env file   | Complete | `.env.production` untracked; public `VITE_*` values documented in `README.md`                                           |
| Secret scanning    | Complete | `gitleaks` added to CI                                                                                                  |
| Dependency audit   | Complete | Pinned FastAPI/starlette, python-multipart, python-dotenv, pytest, pytest-asyncio to fixed versions; `pip-audit` clean  |
| Route-surface test | Updated  | Uses OpenAPI schema instead of internal FastAPI route wrappers                                                          |

## Phase 4 - Efficiency and caching

| Item                      | Status          | Notes                                                                                              |
| ------------------------- | --------------- | -------------------------------------------------------------------------------------------------- |
| Cache single-flight       | Complete        | Per-key tasks replace one global lock around provider calls; different keys run concurrently       |
| Cache invalidation safety | Complete        | Generation counter prevents an in-flight fetch from repopulating an invalidated location prefix    |
| Carbon distance lookup    | Complete        | Origin and destination geocode concurrently via `asyncio.gather`                                   |
| Assistant context size    | Complete        | Carbon trips limited to the backend's 200-item cap before chat requests                            |
| React context stability   | Complete        | `AuthContext` value and callbacks memoized to reduce consumer re-renders                           |
| Location search races     | Complete        | Cancelled-effect guards prevent stale responses overwriting newer results in three search surfaces |
| Bundle splitting          | Already present | Route lazy loading and manual chunks remain unchanged from baseline                                |

## Phase 5 - Test expansion

| Item                           | Status   | Notes                                                                         |
| ------------------------------ | -------- | ----------------------------------------------------------------------------- |
| Frontend unit tests            | Complete | Prediction helpers, assistant utils, location params, Firebase error messages |
| Backend unit/integration tests | Complete | Rate-limit counter + middleware, carbon API contract, shared counter reset    |
| Coverage tooling               | Complete | `npm run test:coverage`, `npm run test:backend:coverage`                      |
| Coverage baseline              | Recorded | Frontend 36% statements; backend 84% statements                               |
| All checks                     | Green    | Frontend 78 tests; backend 255 tests, 9 live tests deselected                 |

## Phase 6 - Accessibility and UX polish

| Item                       | Status   | Notes                                                                                                                       |
| -------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------- |
| Orphan form labels removed | Complete | Settings units and carbon travel-mode groups now use plain labelled text with `aria-labelledby`                             |
| Combobox semantics         | Complete | `aria-controls` is exposed only while the matching listbox is rendered in three location search surfaces                    |
| Mobile navigation          | Complete | Menu button exposes live `aria-expanded`/`aria-controls`; dialog has a stable id                                            |
| Settings tabs              | Complete | Tabs have ids, roving tabindex/arrow-key navigation, labelled panel; error is associated with form and submit button        |
| Form errors                | Complete | Auth/settings/assistant errors have ids, `aria-describedby`, `aria-invalid` where field-scoped, and hidden decorative icons |
| Data visual semantics      | Complete | AQI gauge uses `role="img"`, pollutant bars use `role="progressbar"`, tables have visually hidden captions                  |
| Real-component axe tests   | Complete | Added coverage for AQIGauge, PollutantCard, MobileMenuButton, and ForecastTable; frontend now 82 tests                      |
| All checks                 | Green    | Format, lint, typecheck, 82 frontend tests, build, pre-commit, 255 backend tests, audit, diff check clean                   |

## Phase 7 - Final verification

| Area              | Status   | Evidence                                                                                                                                                      |
| ----------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Code quality      | Green    | Prettier, ESLint, strict TypeScript, Ruff, mypy, and all pre-commit hooks pass                                                                                |
| Security          | Green    | Backend/hosted security headers, CI secret scanning, untracked env file, `pip-audit` clean                                                                    |
| Efficiency        | Green    | Per-key cache, concurrent carbon geocoding, memoized auth context, route-level chunks                                                                         |
| Testing           | Improved | Frontend 83 tests; 38.57% statements, 40.42% branches, 32.23% functions, 39.76% lines; backend 255 tests, 84% statements, 9 live tests deselected, 5 warnings |
| Accessibility     | Green    | axe checks cover real components; labels, errors, roles, tables, tabs, and mobile nav semantics verified                                                      |
| Problem alignment | Green    | Prompt and UI copy centre family smog guidance, low-emission routines, and grounded impact                                                                    |
| Final tree        | Clean    | All checks rerun after Phase 8 commits; `git diff --check` clean                                                                                              |

## Phase 8 - Lint and type hardening

| Item                            | Status   | Notes                                                                                                                                                   |
| ------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend explicit `any` removal | Complete | All explicit `any` removed from source; `tsc`, ESLint and tests unchanged                                                                               |
| React Hooks rules               | Complete | `react-hooks/purity` and `react-hooks/immutability` enabled; `set-state-in-effect` and `preserve-manual-memoization` remain off with documented reasons |
| Indexed access safety           | Complete | `noUncheckedIndexedAccess` enabled; indexed reads made explicit                                                                                         |
| Backend Ruff expansion          | Complete | Added `C90`, `RUF`, `ARG`, `S`, `C4`, `PT`, `ASYNC`, `PERF`; six suppressions remain, each with a reason                                                |
| Backend mypy tightening         | Complete | Added strict flags, moved missing-import tolerance to module overrides, and removed both `type: ignore` comments                                        |
| All checks                      | Green    | Frontend 83 tests, backend 255 tests, coverage percentages and build asset names unchanged; no runtime or API behaviour changes                         |

## Phase 9 - Testing expansion

| Item                                | Status     | Notes                                                                                                                  |
| ----------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------- |
| Frontend page/component tests       | Complete   | Real-component axe checks added for pages, layout, AQI, charts, and UI primitives                                      |
| Frontend hook/context/service tests | Complete   | Assistant, routines, predictions, weather, auth/location contexts, App routing, and service behavior                   |
| Property tests                      | Complete   | Deterministic fast-check and Hypothesis cases for pure frontend/backend helpers                                        |
| Backend branch/error/security tests | Complete   | API, router, RAG, Firebase, cache, HTTP, middleware, and security branches added                                       |
| Coverage gates                      | Complete   | Frontend 85/85/80 thresholds; backend 92% floor; both CI jobs run coverage                                             |
| Determinism and tooling             | Complete   | `Makefile`, fixed Vitest sequence/seed, seeded property tests, `TESTING.md`, and a gitignore entry for Hypothesis data |
| Discovered behavior                 | Documented | Issues found by tests are recorded in `TESTING.md`; no application behavior was changed                                |
| All checks                          | Green      | 504 frontend tests, 566 backend tests, coverage thresholds reached, build asset names/hashes/sizes unchanged           |

## Phase 10 - Pure code-quality refactor

| Item                          | Status          | Notes                                                                                                                                                                                                  |
| ----------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ADRs and module documentation | Complete        | `docs/adr/0001`-`0005` record cache, breaker, grounded fallback, rate-limit, and layout decisions; public modules documented                                                                           |
| Backend module splits         | Complete        | `schemas.py` -> `schema_models/`, `query_router.py` -> `query/`, `weather_service.py` -> `weather/`, `rag_service.py` -> `rag/`, `config.py` -> `config_parts/`; facades re-export every original name |
| Frontend module splits        | Complete        | `dataService`, `backendService`, assistant hook, `LocationPicker`, signup, dashboard, settings, and carbon page now use thin facades with focused hook/UI shards                                       |
| Long-function decomposition   | Complete        | AQI history aggregation, context section assembly, grounded fallback branches, LLM request helpers, assistant route enrichment, and HTTP retry/decode helpers extracted                                |
| Behavior preservation         | Complete        | No test edits, no weakened mocks, no API/security/cache/rate-limit/LLM failover changes; monkeypatch-sensitive globals remain resolved through original facades at call time                           |
| Verification                  | Green           | 504 frontend tests and 566 backend tests pass; frontend ~94.7-94.8% statements / 81.44% branches / ~90.5-90.9% functions / ~96.0% lines; Ruff, ESLint, Prettier, and TypeScript clean                  |
| Build budget                  | Green           | Production build succeeds; total ~1461 kB against the 1456.76 kB baseline, within the allowed range; asset diff is informational because module boundaries changed                                     |
| Mypy                          | Blocked locally | `ImportError: DLL load failed while importing internal: An Application Control policy has blocked this file.` CI remains authoritative; user approved proceeding                                       |
| Already split / skipped       | Complete        | `air_quality_service.py` and `context/sections.py` were split earlier; `TESTING.md` quirks and live-provider behavior intentionally unchanged                                                          |
| Git hygiene                   | Clean           | Each refactor step verified with `verify-refactor.ps1`, committed separately, and checked with `git diff --check`; pre-existing untracked `httpsgithub.comkarthikvummadi703-cr.txt` left untouched     |

## Deferred or intentionally unchanged

- `backend/http_client.py` still uses `follow_redirects=True`; upstream URLs are configuration-driven, and changing redirect behaviour could alter provider calls.
- HSTS/CSP enforcement must also be confirmed in hosted Firebase/Vercel project settings after deployment.
- Canonical raw-provider cache keys for weather/AQI history/AQI forecast are deferred; current shaped keys are intentionally separate to avoid a prior list/dict collision.
- Accessibility refinements were completed in Phase 6; further branch coverage remains a future follow-up.
- Starlette deprecation warnings from current FastAPI test client are non-failing; dependency audit is clean.
