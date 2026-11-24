# Testing

This project keeps tests separated from application behavior. The test expansion added test files, test tooling, and documentation only: no application source, API response, security header, cache/rate-limit behavior, or build output was changed.

## Commands

| Command | Purpose |
| --- | --- |
| `make check` | Frontend format/lint/typecheck plus backend Ruff/mypy |
| `make test-coverage` | Frontend tests with enforced coverage thresholds |
| `make test-backend-coverage` | Backend tests with enforced coverage floor |
| `make ci` | All checks, both coverage suites, and production build |
| `npm run test:coverage` | Direct frontend coverage command |
| `npm run test:backend:coverage` | Direct backend coverage command |

Coverage thresholds are enforced in `vite.config.ts` (`statements >= 85`, `lines >= 85`, `branches >= 80`) and `backend/pytest.ini` (`--cov-fail-under=92`). Both CI jobs run coverage, and the `live` pytest marker stays opt-in.

## Determinism

- Vitest runs tests serially (`sequence.concurrent: false`) in file order (`sequence.shuffle: false`) with seed `20261124`.
- fast-check tests pass explicit seeds and bounded generators.
- Hypothesis tests use `derandomize=True` with `database=None` because Hypothesis 6.130.2 does not accept a `seed` argument on `settings`.
- No test makes a real network call. Tests that would need live providers are not added; the existing `live` marker remains deselected by default.
- React tests use Testing Library with mocked Firebase/provider modules and `restoreMocks: true`.
- Tailwind scans test files, so new tests avoid literal utility-class strings. Expected class values are built by concatenation where they must be asserted. This preserves the original production CSS hash and size.

## Baseline and current results

| Area | Baseline before expansion | Current |
| --- | --- | --- |
| Frontend tests | 9 files, 83 tests | 46 files, 504 tests |
| Frontend coverage | 38.57% statements, 40.42% branches, 32.23% functions, 39.76% lines | 94.7% statements, 81.48% branches, 90.61% functions, 95.95% lines |
| Backend tests | 255 passed, 9 deselected | 566 passed, 9 deselected |
| Backend coverage | 84% statements | 97% statements; pytest-cov reports 96.60% total against the 92% floor |
| Build output | `dist/assets/index-CbHV1b_l.css` 35.63 kB, JS chunks unchanged | Identical asset names, hashes, and sizes |

Axe checks run against real rendered components and pages. Two known violations are isolated with narrowly scoped axe rule disables in their tests; the underlying code was not changed.

## Discovered behavior recorded, not changed

Every item below is an observation from a test. The tests assert current behavior so a future fix will be visible; none of these issues were fixed as part of this task.

### Frontend

- `src/components/aiAssistant/Composer.tsx:114`: hidden file input has no accessible label.
- `src/components/aiAssistant/KnowledgePanel.tsx:38`: `role="button"` dropzone nests a focusable input.
- `src/pages/RoutinesPage.tsx:89`: renders `"No live reading is available for ."` when location is null.
- `src/pages/predictions/ForecastSummary.tsx:106`: `<h3>` appears without a preceding `<h2>`; tests wrap it with a heading to isolate the component.
- `src/pages/CarbonFootprintPage.tsx:84`: savings are computed from local `distance` state, not backend `result.distanceKm`/`result.savings`; an auto-estimated 100 km can show savings of 0.
- `src/pages/PredictionsPage.tsx:64-117`: empty summary/chart/table sections render while loading and when there are no forecasts.
- `src/pages/LoginPage.tsx:36-41` and `src/pages/SignupPage.tsx:65-70`: loading stays active when `loginWithGoogle()` resolves `false` after a popup-to-redirect fallback.
- `src/pages/SettingsPage.tsx:62`: when `getUser` rejects, the form stays blank instead of seeding name/email from auth as the null-profile branch does.
- `src/components/LocationPicker.tsx`: loading listbox triggers axe `aria-required-children`/`listitem` violations; tests disable only those rules. `aria-activedescendant` can stay stale after Enter selection, Set remains enabled after picking, and reverse-geocode fallback updates location without updating the displayed query.
- `src/components/layout/AppLayout.tsx`: mobile menu can expose duplicate unlabeled nav landmarks; tests disable only `landmark-unique`.
- `src/components/aqi/PollutionOutlook.tsx`: heading omits the count (`"Next hours"`/`"Next hour"`).
- `src/components/aqi/HealthAdvisory.tsx`: never shows `"Postpone outdoor events"` and shows `"Good time for outdoor exercise"` for sensitive-group AQI.
- AQI and pollutant charts render empty chart shells without explicit no-data messaging.
- `src/pages/predictions/usePredictions.ts:34-45`: a city-only pinned location can be overridden by stored coordinates from `listAirQualityRecords` before fetching, despite the comment saying override happens only when nothing is pinned.
- `src/pages/predictions/usePredictions.ts:59-69`: if `fetchPredictions` rejects, successfully fetched weather is discarded because `setWeather` only runs in the resolved `Promise.all` branch.
- `src/pages/aiAssistant/upload.ts:19-25`: `setAttachmentError('')` runs once per batch, so an invalid file followed by a valid file leaves the error visible.
- `src/services/profileService.ts:74`: email backfill is skipped when a stored name exists, contrary to the comment.
- `src/services/apiClient.ts:50-57,91`: an older in-flight GET can write stale cache data after a forced refresh, shadowing the newer request.
- `src/services/apiClient.ts:23-30`: `clearResponseCache(prefix)` cannot match path prefixes because cache keys start with `token|`.
- `src/services/storageService.ts:29-33`: a `getDownloadURL` rejection in the completion callback leaves the upload promise pending forever.
- `src/services/lifestyleService.ts:183`: `winter-warm-air` can be emitted in summer when cold/sensitive conditions apply; the winter check is ignored.
- `src/services/dataService.ts:356-366`: `isUploadReady` is false for an empty Firestore result without consulting local storage; fallback runs only on errors.
- `src/context/AuthContext.tsx:101`: `profile?.photoURL ?? user?.photoURL ?? null` falls back to the provider photo when the profile explicitly stores `photoURL: null`. Residual `prev ?? {}` branches remain at lines 109, 118, and 124.
- `src/pages/predictions/helpers.ts` and `src/pages/weather/helpers.ts`: `windDeg` returns `undefined` for negative degrees outside the rounding dead zone despite a `string` return type; `hourLabel`/`dayName` fallback slices are unreachable because `Invalid Date` does not throw, and V8 parses some junk strings containing digits as valid dates.
- `src/pages/aiAssistant/utils.ts`: `toKnowledgeFile` converts non-numeric `size` strings to `NaN` rather than defaulting to `0`, and invalid timestamps become `Invalid Date`.

### Backend

- `backend/services/aqi/math.py`: `_sub_index` extrapolates outside the EPA tables (`-10 -> -42`, `1000 -> 550`); `compute_aqi({"pm2_5": -10})` returns `aqi: 0` with a negative PM2.5 sub-index.
- `backend/schemas.py`: `ChatRequest.documentIds` enforces `max_length=5` before `clean_document_ids`, so six blank strings are rejected even though cleanup would yield `None`.
- `backend/services/context/formatters.py`: `_by_month` preserves order only within each month; interleaved months are regrouped.
- `backend/api/weather.py`: cache keys include `hours`, so different `hours` values make separate upstream calls and cache hits require identical requests; the source comment about smaller windows poisoning larger ones appears stale.
- `backend/services/security.py`: `_FixedWindowCounter._prune` cannot evict stale buckets because `hit()` appends a fresh timestamp after expiring old ones, leaving buckets non-empty.
- `backend/api/rag.py`: encoded slashes in delete ids (`a%2Fb`) produce 404 before route validation; direct calls reject them with `Invalid file identifier.`
- `backend/api/ai.py`: a `comparison` question can set `contextUsed=True` and retrieve a document while omitting excerpts from the prompt because the context builder emits the document section only for intents with a documents block.
- `backend/services/context/sections.py`: historical AQI provider failures degrade to the same text as having no stored readings (`no stored readings for this user yet`).
- `backend/api/ai.py`: weather/history provider failures are tolerated, but AQI provider failures propagate as 503.
- `backend/services/query_router.py`: `classify("temperature versus aqi")` returns `weather`, not `combined`; `classify("my data about ozone")` and `classify("my data about current conditions")` return `documents`.
- `backend/services/air_quality_service.py`: future-year history windows map to the current year-to-date window.
- `backend/http_client.py`: the installed `httpx.AsyncClient` has no `max_connections` or `max_keepalive_connections` attributes.
- `backend/services/fallback.py`: fallback context sections must be separated by blank lines for the AQI section to parse.
