COMPOSE := docker compose
LOCAL_COMPOSE := $(COMPOSE) -f docker-compose.yml -f docker-compose.local.yml

.PHONY: up down logs up-local down-local logs-local build clean

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
