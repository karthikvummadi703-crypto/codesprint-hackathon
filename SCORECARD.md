# Scorecard

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
| All checks | Green | Frontend 49 tests; backend 243 tests after Phase 3 additions |

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

## Deferred or intentionally unchanged

- `backend/http_client.py` still uses `follow_redirects=True`; upstream URLs are configuration-driven, and changing redirect behaviour could alter provider calls.
- HSTS/CSP enforcement must also be confirmed in hosted Firebase/Vercel project settings after deployment.
- Frontend bundle splitting and lazy loading are tracked for Phase 4.
- Accessibility refinements and expanded edge-case tests are tracked for later phases.
- Starlette deprecation warnings from current FastAPI test client are non-failing; dependency audit is clean.
