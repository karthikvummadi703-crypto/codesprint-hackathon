# Contributing

## Local setup

```bash
npm ci --legacy-peer-deps
python -m pip install -r backend/requirements-dev.txt
pre-commit install
```

## Checks

Run these before every commit:

```bash
npm run lint
npm run typecheck
npm run format:check
npm test
npm run build
npm run lint:backend
npm run typecheck:backend
npm run test:backend
```

`pre-commit run --all-files` runs the same formatter and static checks locally.
CI runs the frontend and backend jobs on every push and pull request.
