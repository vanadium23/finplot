# finplot — Make-контракт bdd-standard v1.
# Любой красный прогон = ненулевой exit.

.PHONY: test-lint test-logic test-e2e test report check-stand stand-up stand-down

test-lint:
	node node_modules/.bin/gherkin-lint -r tests/lint-rules tests/features
	python3 tests/lint-rules/check-ru-lexicon.py tests/features

test-logic:
	npx bddgen && npx playwright test --project=logic

test-e2e:
	npx bddgen && npx playwright test --project=e2e

test: test-lint
	npx bddgen && npx playwright test

report: test

STAND_URL ?= http://localhost:41007
COMPOSE ?= /home/faber/faber-hermes-config/infra/finplot/docker-compose.yml

check-stand:
	@curl -sf -o /dev/null $(STAND_URL)/ || (echo "FAIL: / не отвечает" && exit 1)
	@node tests/check-stand-report.cjs $(STAND_URL)

stand-up:
	docker compose -f $(COMPOSE) up -d --build

stand-down:
	docker compose -f $(COMPOSE) down
