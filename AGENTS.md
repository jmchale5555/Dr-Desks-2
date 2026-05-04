# Repository Guidelines

## Project Structure & Module Organization
- `manage.py` is the Django entry point.
- `toolsproject/` contains project settings, URLs, and ASGI/WSGI setup.
- `parcark/` is the primary Django app (models, views, serializers, templates, migrations).
- `frontend/` is the Vite + React app. Source lives in `frontend/src/` (apps, components, context, hooks, services).
- `static/` holds collected static assets; `media/` is for uploaded files.
- `nginx/` contains reverse-proxy configuration.

## Build, Test, and Development Commands
- `docker compose up --build` runs Postgres, Django (`web`), Vite (`node`), and Nginx together.
- `docker compose down` stops the stack and removes containers (keeps the named volume).
- `make up` / `make down` are the preferred shortcuts for starting/stopping the stack.
- `make migrate`, `make makemigrations`, `make createsuperuser` run common Django management commands inside the `web` container.
- `make test-backend` runs Django tests in the `web` container.
- `make test-frontend` runs Vitest in the `node` container.
- `python manage.py runserver 0.0.0.0:8000` starts the Django dev server locally.
- `python manage.py makemigrations` creates new Django migrations after model changes.
- `python manage.py migrate` applies database migrations.
- `python manage.py createsuperuser` creates an admin account for the Django admin.
- `python manage.py collectstatic` gathers static files for production serving.
- `npm install` installs frontend dependencies.
- `npm run dev` starts the Vite dev server on port 5173.
- `npm run build` creates a production frontend build.
- `npm run preview` serves the built frontend locally.

## Coding Style & Naming Conventions
- Python follows standard Django/PEP 8 style with 4-space indentation.
- JavaScript/JSX uses 2-space indentation, semicolons, and single quotes (match existing files).
- React components use PascalCase (e.g., `BookingApp`, `RootLayout`).
- Python modules and files are snake_case (e.g., `ldap_backend.py`).
- No formatter/linter is configured; keep changes consistent with surrounding code.

## Testing Guidelines
- Backend tests use Django’s test runner: `python manage.py test`.
- Place tests in app-level `tests.py` modules (e.g., `parcark/tests.py`).
- Frontend tests use Vitest (`npm run test` or `npm run test:run`).
- When using Docker, prefer `make test-backend` and `make test-frontend`.

## Commit & Pull Request Guidelines
- Git history is minimal (only “Transfer project to new repo”), so no formal convention exists.
- Use concise, imperative commit messages (e.g., “Add LDAP settings endpoint”).
- PRs should include a brief summary, testing notes, and screenshots for UI changes.

## Security & Configuration Tips
- `docker-compose.yaml` defines DB and LDAP env vars; avoid committing real secrets.
- The LDAP certificate at `ldap-cert-chain.crt` is baked into the Docker image; update it when certificates rotate.
