# Scorecard

## Evaluation scorecard

Internal self-assessment on the six evaluation factors, weighted to 100 points. Evidence comes from the final verification pass on 24 Nov 2026 and the localhost runtime check on 20 Nov 2026.

| Factor | Weight | Score | Evidence / remaining gap |
| --- | ---: | ---: | --- |
| Code quality | 20 | 20 | Strict TypeScript incl. `noUncheckedIndexedAccess`, ESLint with react-hooks purity/immutability, Prettier, expanded Ruff, tightened mypy, pre-commit, and build all pass |
| Security | 20 | 19 | Security headers, gitleaks CI, untracked env file, and clean `pip-audit`; hosted HSTS/CSP still needs post-deploy confirmation |
| Efficiency | 15 | 14 | Per-key single-flight cache, concurrent carbon geocoding, memoized auth context, and route-level chunks; no final profiling pass |
| Testing | 15 | 12 | 83 frontend tests and 255 backend tests; backend 84% statements but frontend only 38.57% statements |
| Accessibility | 15 | 14 | Axe checks on real components plus labels, errors, roles, tables, tabs, and mobile nav semantics; manual screen-reader pass outstanding |
| Problem alignment and functionality | 15 | 15 | Prompt/UI copy match the problem statement; localhost checks returned 200 for app, AQI, weather, predictions, geocode, and carbon endpoints |
| **Total** | **100** | **94** | **Strong overall; remaining points are coverage, hosted header confirmation, and manual accessibility/profiling validation** |

Path to 100: raise frontend statement coverage, confirm hosted HSTS/CSP after deployment, run a manual keyboard/screen-reader pass, and profile the provider/cache hot paths.

## Baseline

| Area | Status | Notes |
| --- | --- | --- |
| Frontend format/lint/typecheck | Green | `npm run format:check`, `npm run lint`, `npm run typecheck` |
| Frontend tests/build | Green | 49 tests passed; Vite build succeeded |
| Backend lint/format/typecheck | Green | `ruff`, `ruff format --check`, `python -m mypy .` |
| Backend tests | Green | 241 passed, 9 deselected |
| Dependency audit | Initially failing | 15 advisories in `python-multipart`, `python-dotenv`, `pytest`, `starlette` |

## Phase 1 - Prompt and copy alignment

| Item | Status | Notes |
| --- | --- | --- |
| Prompt moved to `backend/prompts/assistant.py` | Complete | Family/smog framing; evidence-grounded wording |
| UI/meta copy aligned | Complete | `index.html`, `README.md` |
| Prompt tests | Green | Existing phrase assertions preserved |

## Phase 2 - Structure and quality gates

| Item | Status | Notes |
| --- | --- | --- |
| Large frontend pages split | Complete | Assist, predictions, weather, routines subfolders |
| Large backend services split | Complete | AQI and context packages plus fallback/breaker extraction |
| Strict TypeScript checks | Complete | `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns` |
| Prettier/Ruff/mypy/pytest gates | Complete | Local hooks and CI gates added |
| All checks | Green | Frontend 82 tests; backend 255 tests after Phases 3-6 additions |

## Phase 3 - Security hardening

| Item | Status | Notes |
| --- | --- | --- |
| Security headers | Complete | CSP, HSTS, Permissions-Policy, nosniff, frame/referrer policy in `firebase.json`, `vercel.json`, and backend middleware |
| Header tests | Complete | Added two cases in `backend/tests/test_security_and_api.py` |
| PDF dependency | Complete | `PyPDF2` replaced with maintained `pypdf==7.1.1` |
| Tracked env file | Complete | `.env.production` untracked; public `VITE_*` values documented in `README.md` |
| Secret scanning | Complete | `gitleaks` added to CI |
| Dependency audit | Complete | Pinned FastAPI/starlette, python-multipart, python-dotenv, pytest, pytest-asyncio to fixed versions; `pip-audit` clean |
| Route-surface test | Updated | Uses OpenAPI schema instead of internal FastAPI route wrappers |

## Phase 4 - Efficiency and caching

| Item | Status | Notes |
| --- | --- | --- |
| Cache single-flight | Complete | Per-key tasks replace one global lock around provider calls; different keys run concurrently |
| Cache invalidation safety | Complete | Generation counter prevents an in-flight fetch from repopulating an invalidated location prefix |
| Carbon distance lookup | Complete | Origin and destination geocode concurrently via `asyncio.gather` |
| Assistant context size | Complete | Carbon trips limited to the backend's 200-item cap before chat requests |
| React context stability | Complete | `AuthContext` value and callbacks memoized to reduce consumer re-renders |
| Location search races | Complete | Cancelled-effect guards prevent stale responses overwriting newer results in three search surfaces |
| Bundle splitting | Already present | Route lazy loading and manual chunks remain unchanged from baseline |

## Phase 5 - Test expansion

| Item | Status | Notes |
| --- | --- | --- |
| Frontend unit tests | Complete | Prediction helpers, assistant utils, location params, Firebase error messages |
| Backend unit/integration tests | Complete | Rate-limit counter + middleware, carbon API contract, shared counter reset |
| Coverage tooling | Complete | `npm run test:coverage`, `npm run test:backend:coverage` |
| Coverage baseline | Recorded | Frontend 36% statements; backend 84% statements |
| All checks | Green | Frontend 78 tests; backend 255 tests, 9 live tests deselected |

## Phase 6 - Accessibility and UX polish

| Item | Status | Notes |
| --- | --- | --- |
| Orphan form labels removed | Complete | Settings units and carbon travel-mode groups now use plain labelled text with `aria-labelledby` |
| Combobox semantics | Complete | `aria-controls` is exposed only while the matching listbox is rendered in three location search surfaces |
| Mobile navigation | Complete | Menu button exposes live `aria-expanded`/`aria-controls`; dialog has a stable id |
| Settings tabs | Complete | Tabs have ids, roving tabindex/arrow-key navigation, labelled panel; error is associated with form and submit button |
| Form errors | Complete | Auth/settings/assistant errors have ids, `aria-describedby`, `aria-invalid` where field-scoped, and hidden decorative icons |
| Data visual semantics | Complete | AQI gauge uses `role="img"`, pollutant bars use `role="progressbar"`, tables have visually hidden captions |
| Real-component axe tests | Complete | Added coverage for AQIGauge, PollutantCard, MobileMenuButton, and ForecastTable; frontend now 82 tests |
| All checks | Green | Format, lint, typecheck, 82 frontend tests, build, pre-commit, 255 backend tests, audit, diff check clean |

## Phase 7 - Final verification

| Area | Status | Evidence |
| --- | --- | --- |
| Code quality | Green | Prettier, ESLint, strict TypeScript, Ruff, mypy, and all pre-commit hooks pass |
| Security | Green | Backend/hosted security headers, CI secret scanning, untracked env file, `pip-audit` clean |
| Efficiency | Green | Per-key cache, concurrent carbon geocoding, memoized auth context, route-level chunks |
| Testing | Improved | Frontend 83 tests; 38.57% statements, 40.42% branches, 32.23% functions, 39.76% lines; backend 255 tests, 84% statements, 9 live tests deselected, 5 warnings |
| Accessibility | Green | axe checks cover real components; labels, errors, roles, tables, tabs, and mobile nav semantics verified |
| Problem alignment | Green | Prompt and UI copy centre family smog guidance, low-emission routines, and grounded impact |
| Final tree | Clean | All checks rerun after Phase 8 commits; `git diff --check` clean |

## Phase 8 - Lint and type hardening

| Item | Status | Notes |
| --- | --- | --- |
| Frontend explicit `any` removal | Complete | All explicit `any` removed from source; `tsc`, ESLint and tests unchanged |
| React Hooks rules | Complete | `react-hooks/purity` and `react-hooks/immutability` enabled; `set-state-in-effect` and `preserve-manual-memoization` remain off with documented reasons |
| Indexed access safety | Complete | `noUncheckedIndexedAccess` enabled; indexed reads made explicit |
| Backend Ruff expansion | Complete | Added `C90`, `RUF`, `ARG`, `S`, `C4`, `PT`, `ASYNC`, `PERF`; six suppressions remain, each with a reason |
| Backend mypy tightening | Complete | Added strict flags, moved missing-import tolerance to module overrides, and removed both `type: ignore` comments |
| All checks | Green | Frontend 83 tests, backend 255 tests, coverage percentages and build asset names unchanged; no runtime or API behaviour changes |

## Deferred or intentionally unchanged

- `backend/http_client.py` still uses `follow_redirects=True`; upstream URLs are configuration-driven, and changing redirect behaviour could alter provider calls.
- HSTS/CSP enforcement must also be confirmed in hosted Firebase/Vercel project settings after deployment.
- Canonical raw-provider cache keys for weather/AQI history/AQI forecast are deferred; current shaped keys are intentionally separate to avoid a prior list/dict collision.
- Accessibility refinements were completed in Phase 6; further branch coverage remains a future follow-up.
- Starlette deprecation warnings from current FastAPI test client are non-failing; dependency audit is clean.
