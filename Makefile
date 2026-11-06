# Run make from the project root. setup-dev configures the accepted stack's hooks.
# Every hook runs from APP_DIR; component paths are relative to that directory.
.DEFAULT_GOAL := help

APP_DIR ?= app
COMPOSE ?= docker compose -f compose.yaml

# Containerized Express/PostgreSQL setup. Product event APIs remain pending.
INSTALL_CMD ?= $(COMPOSE) build api
UP_CMD ?= $(COMPOSE) up -d --build --wait --wait-timeout 90
DOWN_CMD ?= $(COMPOSE) down
LOGS_CMD ?= $(COMPOSE) logs -f
FRONTEND_CMD ?=
BACKEND_CMD ?= $(COMPOSE) up --build api
LINT_CMD ?=
BUILD_CMD ?= $(COMPOSE) build api
TEST_FRONTEND_CMD ?=
TEST_BACKEND_CMD ?= docker build --target test -t cmb-poc-api-tests .
TEST_E2E_CMD ?=
# Include only runnable suites; document product tests pending implementation.
TEST_TARGETS ?= test-backend

.PHONY: help init config install up down logs frontend backend lint build test test-frontend test-backend test-e2e psql db-migrate test-db vendor vendor-check

help:
	@printf '%s\n' \
	  'Run from the project root: make <target>' \
	  'init           Create app/.env once with random local credentials' \
	  'config         Validate the Compose configuration without printing secrets' \
	  'install        Install application dependencies' \
	  'up / down      Start / stop the selected development environment' \
	  'logs           Follow development service logs' \
	  'frontend       Start the frontend' \
	  'backend        Start the backend' \
	  'lint / build   Check / build applicable components' \
	  'test           Run the configured automated test suites' \
	  'test-frontend  Run frontend unit/component tests' \
	  'test-backend   Run backend unit/integration tests' \
	  'test-e2e       Run end-to-end tests' \
	  'psql           Open psql as the application role inside db' \
	  'db-migrate     Apply versioned schema migrations as the application role' \
	  'test-db        Check the real DB schema using rolled-back synthetic data' \
	  'vendor         Run the fixed vendor on the host (foreground)' \
	  'vendor-check   Probe the strict host vendor from the API container' \
	  'Frontend, lint, and product E2E targets remain unconfigured.'

init:
	cd "$(APP_DIR)" && python3 scripts/init-env.py

config: init
	cd "$(APP_DIR)" && $(COMPOSE) config --quiet

up backend: init

psql:
	cd "$(APP_DIR)" && $(COMPOSE) exec db psql -U event_relay_app -d event_relay

db-migrate:
	cd "$(APP_DIR)" && $(COMPOSE) cp db/migrations/001_create_events.sql db:/tmp/cmb-001-create-events.sql
	cd "$(APP_DIR)" && $(COMPOSE) exec -T db psql -X -v ON_ERROR_STOP=1 -U event_relay_app -d event_relay -f /tmp/cmb-001-create-events.sql

test-db:
	cd "$(APP_DIR)" && $(COMPOSE) -f compose.test.yaml run --rm --no-deps --build api

vendor:
	cd "$(APP_DIR)" && python3 ../vendor.py --port 9000

vendor-check:
	cd "$(APP_DIR)" && $(COMPOSE) exec -T api node scripts/check-vendor.mjs

# Fail before starting a shell if a command has not been configured.
define run
$(if $(strip $(1)),,$(error Target "$(2)" is not configured; finish setup in Makefile and README.md))
cd "$(APP_DIR)" && $(1)
endef

install:
	$(call run,$(INSTALL_CMD),install)

up:
	$(call run,$(UP_CMD),up)

down:
	$(call run,$(DOWN_CMD),down)

logs:
	$(call run,$(LOGS_CMD),logs)

frontend:
	$(call run,$(FRONTEND_CMD),frontend)

backend:
	$(call run,$(BACKEND_CMD),backend)

lint:
	$(call run,$(LINT_CMD),lint)

build:
	$(call run,$(BUILD_CMD),build)

test:
	$(if $(strip $(TEST_TARGETS)),,$(error No test suites configured; set TEST_TARGETS during setup-dev))
	$(MAKE) $(TEST_TARGETS)

test-frontend:
	$(call run,$(TEST_FRONTEND_CMD),test-frontend)

test-backend:
	$(call run,$(TEST_BACKEND_CMD),test-backend)

test-e2e:
	$(call run,$(TEST_E2E_CMD),test-e2e)
