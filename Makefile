.PHONY: test lint typecheck build shot

test:
	npm test

lint:
	npm run lint

typecheck:
	npm run typecheck

build:
	npm run build

shot: build
	python3 scripts/termshot.py
