# AirGuard AI

AirGuard AI is a GenAI-powered clean-air companion that helps families and communities navigate severe winter smog and urban air pollution. It turns live, location-specific air-quality and weather data into practical low-emission routines, indoor air-quality habits and sustainable alternatives, and explains the direct impact of each suggestion using only measured readings and existing calculations. Optional Firebase-backed records and household routine context keep that guidance relevant to the people you care for.

## Features

- Location search and current air-quality dashboard with AQI guidance.
- Pollutant trends, AQI outlook, and model/heuristic prediction explanations.
- Historical air-quality lookup (past years, named months, "last N days", and seasons) from Open-Meteo reanalysis, exposed as `GET /api/aqi/history` and answered directly by the AI assistant.
- Weather report and carbon-footprint tracking for commute and travel modes.
- Daily routines page for household profiles, sensitive members, community watch places, and AQI-aware routines.
- GenAI assistant with conversation history, document uploads, grounded context, and household/routine-aware answers framed as what to do, why it helps (direct impact), and the effort involved.
- Firebase Auth, Firestore persistence, Storage-backed knowledge documents, and a client-processed profile photo (downscaled in-browser, no storage bucket required).
- Accessible navigation, keyboard-friendly location pickers, visible focus states, ARIA roles, and reduced-motion support.

## Tech stack

| Layer          | Technologies                                                                                         |
| -------------- | ---------------------------------------------------------------------------------------------------- |
| Frontend       | React 19, TypeScript, Vite 8, React Router 7, Tailwind CSS 3, Recharts, Firebase Web SDK             |
| Backend        | Python 3.11+, FastAPI, Uvicorn, Pydantic, HTTPX, Firebase Admin                                      |
| Data providers | Open-Meteo air quality and weather, Nominatim geocoding, optional Google Air Quality and OpenWeather |
| AI             | Any OpenAI-compatible chat completions endpoint, with a grounded fallback when no key is configured  |
| Testing        | Vitest, Testing Library, jest-axe, fast-check, Hypothesis, ESLint, pytest, coverage gates            |
| CI             | GitHub Actions                                                                                       |

## Quick start

### Prerequisites

- Node.js 20.19+ or 22.12+ (Node 24 also works)
- Python 3.11+
- Git

### 1. Install frontend dependencies

```bash
npm ci --legacy-peer-deps
```

### 2. Configure environment files

```bash
copy .env.example .env
copy backend\.env.example backend\.env
```

Fill in only the values you need. The backend runs without keys using keyless Open-Meteo and Nominatim providers; AI chat reports a degraded state until `LLM_API_KEY` is set. Firebase Admin credentials enable real authentication and per-user persistence.

### 3. Install backend dependencies

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

### 4. Run both servers

Terminal 1:

```bash
npm run dev
```

Terminal 2, from `backend/`:

```bash
uvicorn main:app --reload --port 8001
```

Open <http://localhost:5173>. Backend docs are available at <http://localhost:8001/api/docs> and health at <http://localhost:8001/api/health>.

## Environment variables

### Frontend (`.env`)

| Variable                            | Purpose                                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `VITE_FIREBASE_API_KEY`             | Firebase Web API key                                                                                         |
| `VITE_FIREBASE_AUTH_DOMAIN`         | Firebase Auth domain                                                                                         |
| `VITE_FIREBASE_PROJECT_ID`          | Firebase project ID                                                                                          |
| `VITE_FIREBASE_STORAGE_BUCKET`      | Firebase Storage bucket                                                                                      |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender ID                                                                                 |
| `VITE_FIREBASE_APP_ID`              | Firebase app ID                                                                                              |
| `VITE_FIREBASE_MEASUREMENT_ID`      | Optional Analytics measurement ID                                                                            |
| `VITE_API_BASE_URL`                 | Optional backend override; defaults to `http://localhost:8001` in dev and the deployed API URL in production |

Firebase Web config values are intentionally shipped to the browser; access control comes from Firebase Auth and security rules. Never put service-account keys or LLM keys in `VITE_*` variables. `.env.production` is not tracked; set these public `VITE_*` values in the Firebase/Vercel project settings instead of committing them.

### Backend (`backend/.env`)

Important groups:

- Environment and CORS: `ENVIRONMENT`, `ALLOWED_ORIGINS`, `ALLOW_DEV_AUTH`
- Firebase Admin: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`
- LLM: `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, `LLM_FALLBACK_MODELS`, `LLM_TIMEOUT_S`, `LLM_TOTAL_BUDGET_S`
- Air quality: `GOOGLE_AQ_API_KEY`, `OPENWEATHER_APPID` / `AIR_QUALITY_API_KEY`
- Geocoding: `NOMINATIM_BASE_URL`, `NOMINATIM_USER_AGENT`
- Caching: `CACHE_TTL_AQI_S`, `CACHE_TTL_WEATHER_S`, `CACHE_TTL_GEOCODE_S`, `CACHE_MAX_ENTRIES`
- Rate limiting: `RATE_LIMIT_ENABLED`, `RATE_LIMIT_REQUESTS`, `RATE_LIMIT_WINDOW_S`, `RATE_LIMIT_CHAT_REQUESTS`, `RATE_LIMIT_CHAT_WINDOW_S`

`ENVIRONMENT=production` (or hosted platform signals such as `VERCEL`, `PORT`, or `RAILWAY_ENVIRONMENT`) disables `dev:` tokens, drops loopback CORS origins, and adds the deployed Firebase origins. If Firebase Admin is missing in production, the backend logs a warning and falls back to process-local document storage.

See `.env.example` and `backend/.env.example` for the full annotated lists.

## Scripts

| Command                         | Description                                                    |
| ------------------------------- | -------------------------------------------------------------- |
| `npm run dev`                   | Start the Vite development server                              |
| `npm run build`                 | Typecheck and create a production build                        |
| `npm run preview`               | Serve the production build locally                             |
| `npm run typecheck`             | Run TypeScript checks without emitting files                   |
| `npm run lint`                  | Run ESLint                                                     |
| `npm run lint:fix`              | Fix ESLint issues where possible                               |
| `npm test`                      | Run frontend unit, accessibility, and property tests once      |
| `npm run test:watch`            | Run frontend tests in watch mode                               |
| `npm run test:coverage`         | Run frontend tests with enforced coverage thresholds           |
| `npm run test:backend`          | Run backend pytest suite                                       |
| `npm run test:backend:coverage` | Run backend pytest with coverage and an enforced floor         |
| `make ci`                       | Run all checks, both coverage suites, and the production build |

## Verification

Current verified results:

- `npm run format:check`, `npm run lint`, `npm run typecheck`: clean
- Ruff and Ruff format check: clean; local mypy is blocked by a Windows Application Control policy, so CI remains authoritative
- `npm run test:coverage`: 46 files, 504 tests passed; ~94.7-94.8% statements, 81.44% branches, ~90.5-90.9% functions, ~96.0% lines
- `npm run test:backend:coverage`: 566 passed, 9 deselected; 97% statements, 92% floor enforced
- `npm run build`: successful; total bundle ~1461 kB against a 1456.76 kB baseline, within the allowed range
- `npm audit --omit=dev`: 0 vulnerabilities
- `npm audit`: 0 vulnerabilities

A later pure refactor split large pages/services and long functions without changing behavior, tests, API responses, security rules, cache/rate-limit policy, or provider failovers. Asset hashes may shift because module boundaries changed; the total-size guard and all checks remain green.

See `TESTING.md` for coverage commands, determinism notes, and behavior discovered by tests that was intentionally not changed.

## Architecture

```text
src/
  components/         Shared UI, layout, charts, and AQI components
  context/            Firebase auth and location contexts
  pages/              Route pages plus focused hook/UI shards
  services/           Firebase, backend client, data, and lifestyle services with facade modules
  test/               Test setup
  types/              Shared TypeScript types
backend/
  api/                FastAPI routers
  middleware.py       Timing and per-user rate limiting
  config.py           Centralized, validated environment access with config_parts/
  schema_models/      Domain-specific Pydantic schemas
  services/           AQI, weather, geocode, RAG, context, query, and AI services
  tests/              pytest suite
.github/workflows/ci.yml
```

Large frontend pages and services keep their original import paths as thin facades; their implementation is split into focused hooks and presentational shards. Backend modules use the same facade pattern for schemas, config, query routing, weather, RAG, AQI history, context building, and HTTP retry helpers.

The frontend caches GET responses in memory with in-flight request coalescing. Refresh actions use `force: true` to bypass both the cache and any stale in-flight request. Production builds split React, charts, Firebase Auth, Firestore, Firebase core, and icons into separate chunks for better caching.

## Deployment

1. Build the frontend with `npm run build` and serve `dist/` as a static SPA.
2. Deploy `backend/` as an ASGI application with `main:app`.
3. Set backend `ENVIRONMENT=production` and configure Firebase Admin credentials.
4. Set frontend `VITE_*` Firebase values and `VITE_API_BASE_URL` if the API is not at the default production URL.
5. Keep service-account keys, LLM keys, and provider keys only in backend environment settings.

`vercel.json` pins `ENVIRONMENT=production` for hosted deployments.

## Security notes

- All secret reads go through `backend/config.py`; secrets are never logged.
- Production disables local `dev:` auth tokens.
- Rate limiting uses the verified Firebase uid and ignores spoofable forwarding headers.
- CORS is restricted to explicit origins.
- Uploaded documents are size-limited and stored per authenticated user.
- Dependency overrides pin patched transitive packages (`@grpc/grpc-js`, `re2js`, `postcss-selector-parser`).

## Troubleshooting

- **AI says it is unavailable:** confirm `LLM_API_KEY` on the backend; the app remains usable with grounded fallback answers.
- **AI answers stop mid-sentence:** reasoning models spend part of `max_tokens` on hidden thinking. The backend reserves output headroom when `LLM_REASONING_EFFORT` is set and retries truncated replies; raising `LLM_MAX_TOKENS` above 400 also helps.
- **No persisted chats/uploads:** confirm Firebase Admin variables in `backend/.env`; otherwise process-local fallback is used.
- **CORS errors:** check `ALLOWED_ORIGINS` and that the frontend `VITE_API_BASE_URL` points to the running backend.
- **Location search fails:** Nominatim requires a real `NOMINATIM_USER_AGENT` and has usage-rate limits.
- **Stale data after refresh:** refresh actions use forced requests; check the browser network tab for `force=true`.
