# Contributing

## Local setup

```bash
npm ci --legacy-peer-deps
python -m pip install -r backend/requirements-dev.txt
python -m pre_commit install
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
pip-audit -r backend/requirements.txt -r backend/requirements-dev.txt
```

Coverage reports are available with `npm run test:coverage` and `npm run test:backend:coverage`.

`python -m pre_commit run --all-files` runs the same formatter and static checks locally.
CI also runs `gitleaks` and `pip-audit` on every push and pull request.
