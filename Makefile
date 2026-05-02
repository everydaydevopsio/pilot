COMPOSE := docker compose
LOCAL_COMPOSE := $(COMPOSE) -f docker-compose.yml -f docker-compose.local.yml
E2E_HTTP_COMPOSE := $(COMPOSE) -f docker-compose.e2e.yml --profile http
E2E_MCP_COMPOSE  := $(COMPOSE) -f docker-compose.e2e.yml --profile mcp

.PHONY: up down logs up-local down-local logs-local build clean e2e e2e-mcp

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

# Run HTTP e2e tests in Docker (WebSocket/HTTP API, Chrome as a separate service)
e2e:
	$(E2E_HTTP_COMPOSE) up --build --abort-on-container-exit --exit-code-from e2e

# Run MCP e2e tests in Docker (MCP tools, Chrome managed by the MCP server)
e2e-mcp:
	$(E2E_MCP_COMPOSE) up --build --abort-on-container-exit --exit-code-from e2e-mcp
