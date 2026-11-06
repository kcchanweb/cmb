# Run make from the project root. setup-dev configures the accepted stack's hooks.
# Every hook runs from APP_DIR; component paths are relative to that directory.
.DEFAULT_GOAL := help

APP_DIR ?= app
COMPOSE ?= docker compose -f compose.yaml

# Populate during setup-dev; init-project leaves these guarded.
# Compose example: UP_CMD = $(COMPOSE) up -d --build
# Native example: FRONTEND_CMD = cd frontend && npm run dev
INSTALL_CMD ?=
UP_CMD ?=
DOWN_CMD ?=
LOGS_CMD ?=
FRONTEND_CMD ?=
BACKEND_CMD ?=
LINT_CMD ?=
BUILD_CMD ?=
TEST_FRONTEND_CMD ?=
TEST_BACKEND_CMD ?=
TEST_E2E_CMD ?=
# Include only runnable suites; document product tests pending implementation.
TEST_TARGETS ?=

.PHONY: help install up down logs frontend backend lint build test test-frontend test-backend test-e2e

help:
	@printf '%s\n' \
	  'Run from the project root: make <target>' \
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
	  'Unconfigured targets fail. See README.md and docs/testing.md for setup status.'

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
