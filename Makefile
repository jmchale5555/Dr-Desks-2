DC=docker compose

.PHONY: help up down restart logs ps bash-web bash-node migrate makemigrations createsuperuser test-backend test-backend-bookings npm-install test-frontend test-frontend-watch build-frontend

help:
	@printf "Available commands:\n"
	@printf "  make up                   Start all services in background\n"
	@printf "  make down                 Stop and remove containers\n"
	@printf "  make restart              Restart the full stack\n"
	@printf "  make logs                 Follow compose logs\n"
	@printf "  make ps                   Show compose service status\n"
	@printf "  make bash-web             Open shell in web container\n"
	@printf "  make bash-node            Open shell in node container\n"
	@printf "  make migrate              Run Django migrations\n"
	@printf "  make makemigrations       Create Django migrations\n"
	@printf "  make createsuperuser      Create Django superuser\n"
	@printf "  make test-backend         Run full Django test suite\n"
	@printf "  make test-backend-bookings Run BookingApiTests only\n"
	@printf "  make npm-install          Install frontend deps in node container\n"
	@printf "  make test-frontend        Run Vitest once\n"
	@printf "  make test-frontend-watch  Run Vitest in watch mode\n"
	@printf "  make build-frontend       Build frontend assets\n"

up:
	$(DC) up --build -d

down:
	$(DC) down

restart: down up

logs:
	$(DC) logs -f

ps:
	$(DC) ps

bash-web:
	$(DC) exec web bash

bash-node:
	$(DC) exec node sh

migrate:
	$(DC) exec web python manage.py migrate

makemigrations:
	$(DC) exec web python manage.py makemigrations

createsuperuser:
	$(DC) exec web python manage.py createsuperuser

test-backend:
	$(DC) exec web python manage.py test

test-backend-bookings:
	$(DC) exec web python manage.py test parcark.tests.BookingApiTests

npm-install:
	$(DC) exec node npm install

test-frontend:
	$(DC) exec node npm run test:run

test-frontend-watch:
	$(DC) exec node npm run test

build-frontend:
	$(DC) exec node npm run build
