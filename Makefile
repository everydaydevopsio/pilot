SHELL := /bin/bash

COMPOSE := docker compose
LOCAL_COMPOSE := $(COMPOSE) -f docker-compose.yml -f docker-compose.local.yml
E2E_HTTP_COMPOSE := $(COMPOSE) -f docker-compose.e2e.yml --profile http
E2E_MCP_COMPOSE  := $(COMPOSE) -f docker-compose.e2e.yml --profile mcp
SMOKE_COMPOSE    := $(COMPOSE) -f docker-compose.smoke.yml
NVM_DIR ?= $(HOME)/.nvm
NODE_VERSION := $(shell tr -d '[:space:]' < .nvmrc)
PNPM_VERSION := $(shell node -p "require('./package.json').packageManager.split('@')[1].split('+')[0]" 2>/dev/null || sed -n 's/.*"packageManager": "pnpm@\([^+]*\).*/\1/p' package.json)

.PHONY: deps setup up down logs up-local down-local logs-local build clean smoke e2e e2e-mcp

# Install host-level development prerequisites. Homebrew is used on macOS and Linux.
deps:
	@set -eu; \
	if ! command -v brew >/dev/null 2>&1; then \
		echo "Homebrew is required. Install it from https://brew.sh and rerun 'make deps'." >&2; \
		exit 1; \
	fi; \
	if ! brew list nvm >/dev/null 2>&1; then \
		brew install nvm; \
	elif [ ! -s "$$(brew --prefix nvm)/nvm.sh" ]; then \
		brew reinstall nvm; \
	fi; \
	mkdir -p "$(NVM_DIR)"; \
	echo "Development prerequisites are installed."

# Install the pinned Node and pnpm versions, then install project dependencies.
setup: deps
	@set -eu; \
	export NVM_DIR="$(NVM_DIR)"; \
	. "$$(brew --prefix nvm)/nvm.sh" --no-use; \
	nvm install "$(NODE_VERSION)"; \
	nvm use "$(NODE_VERSION)"; \
	corepack enable; \
	corepack prepare "pnpm@$(PNPM_VERSION)" --activate; \
	pnpm install --frozen-lockfile; \
	pnpm build

up:
	$(COMPOSE) up --build

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f

up-local:
	$(LOCAL_COMPOSE) up --build --watch

down-local:
	$(LOCAL_COMPOSE) down

logs-local:
	$(LOCAL_COMPOSE) logs -f

build:
	$(COMPOSE) build

clean:
	$(COMPOSE) down -v --rmi local

# Run smoke test in Docker (MCP server start + tool list, no browser required)
smoke:
	$(SMOKE_COMPOSE) up --build --abort-on-container-exit --exit-code-from smoke

# Run HTTP e2e tests in Docker (WebSocket/HTTP API, Chrome as a separate service)
e2e:
	$(E2E_HTTP_COMPOSE) up --build --abort-on-container-exit --exit-code-from e2e

# Run MCP e2e tests in Docker (MCP tools, Chrome managed by the MCP server)
e2e-mcp:
	$(E2E_MCP_COMPOSE) up --build --abort-on-container-exit --exit-code-from e2e-mcp
