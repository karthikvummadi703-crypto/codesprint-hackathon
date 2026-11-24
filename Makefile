.PHONY: all check check-frontend check-backend ci test test-coverage test-backend test-backend-coverage build

all: check

check: check-frontend check-backend

check-frontend:
	npm run format:check
	npm run lint
	npm run typecheck

check-backend:
	npm run lint:backend
	npm run typecheck:backend

ci: check test-coverage test-backend-coverage build

test:
	npm test

test-coverage:
	npm run test:coverage

test-backend:
	npm run test:backend

test-backend-coverage:
	npm run test:backend:coverage

build:
	npm run build
