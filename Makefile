.PHONY: help install frontend-backend-checks frontend-checks backend-checks coverage coverage-frontend coverage-backend all fix

help:
	@echo "Available targets: install frontend-checks backend-checks coverage coverage-frontend coverage-backend all fix"

install:
	npm ci --legacy-peer-deps
	python -m pip install -r backend/requirements.txt

frontend-checks:
	npm run lint
	npm run typecheck
	npm test
	npm run build

backend-checks:
	cd backend && python -m ruff check .
	cd backend && python -m mypy .
	cd backend && python -m pytest -q --no-cov

coverage-frontend:
	npm run test:coverage

coverage-backend:
	cd backend && python -m pytest -q

coverage: coverage-frontend coverage-backend

all: frontend-checks backend-checks coverage

fix:
	npm run lint:fix
	cd backend && python -m ruff check --fix .
