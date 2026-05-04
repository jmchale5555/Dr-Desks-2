# DR Desks

Desk booking platform built with Django + Django REST Framework on the backend and React + Vite on the frontend.

## What this project does

- User authentication (session-based)
- Room and desk management
- Desk booking and cancellation
- "My bookings" view for users
- Admin area for room management
- LDAP settings UI and backend integration points
- Analytics dashboard for booking activity

## Tech stack

- Backend: Django 5, Django REST Framework, PostgreSQL
- Frontend: React 18, React Router, Vite, Tailwind CSS, Chart.js
- Infra (dev): Docker Compose (`db`, `web`, `node`, `nginx`)

## Quick start (development)

Prerequisites:

- Docker + Docker Compose
- Optional: `sudo` for Docker commands if your user is not in the `docker` group

From the repo root:

```bash
git clone https://github.com/jmchale5555/dr-desks-2
cd dr-desk-2
make up
```

After the initial build completes:

```bash
make migrate
make createsuperuser
```

Then open:

- Frontend app: `http://localhost:5173`
- Django API/dev server: `http://localhost:8000`
- Nginx (proxy container): `http://localhost:8080`

## Environment variables

Current development values are defined in `docker-compose.yaml`.

### Backend (`web` service)

- `DEBUG` (default: `1` in compose)
- `DB_NAME` (default: `django_db`)
- `DB_USER` (default: `django_user`)
- `DB_PASSWORD` (default: `django_password`)
- `DB_HOST` (default: `db`)
- `DB_PORT` (default: `5432`)
- `LDAP_ENCRYPTION_KEY` (required for LDAP bind password encryption/decryption)

### Database (`db` service)

- `POSTGRES_DB` (default: `django_db`)
- `POSTGRES_USER` (default: `django_user`)
- `POSTGRES_PASSWORD` (default: `django_password`)

### Frontend

- `VITE_API_URL` (optional)
  - Default if unset: `http://localhost:8000/api`
  - Used by frontend API client in `frontend/src/services/api.js`

## Useful development commands

### Makefile shortcuts (recommended)

```bash
make help
make up
make down
make logs
make ps
make migrate
make makemigrations
make createsuperuser
make test-backend
make npm-install
make test-frontend
make build-frontend
```

### Docker-based (recommended in this repo)

```bash
(sudo) docker compose up --build
(sudo) docker compose down
(sudo) docker compose exec web python manage.py migrate
(sudo) docker compose exec web python manage.py createsuperuser
(sudo) docker compose exec web python manage.py test
```

### Local (without Docker)

Backend:

```bash
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
python manage.py test
```

Frontend:

```bash
npm install
npm run dev
npm run build
npm run test
```

## High-level architecture

### Backend

- Project config: `toolsproject/`
  - Settings: `toolsproject/settings.py`
  - URL root: `toolsproject/urls.py`
- Main app: `parcark/`
  - Models: `parcark/models.py` (`User`, `Room`, `Desk`, `Booking`, `LDAPSettings`)
  - API views/viewsets: `parcark/views.py`
  - API routes: `parcark/urls.py`
  - Serializers: `parcark/serializers.py`
  - Signals: `parcark/signals.py` (e.g., auto-create desks when a room is created)

API routing is currently mounted at both:

- `/` (e.g., `/auth/login/`, `/rooms/`)
- `/api/` (e.g., `/api/auth/login/`, `/api/rooms/`)

### Frontend

- Entry and routing: `frontend/src/main.jsx`
- App areas:
  - Booking: `frontend/src/apps/booking/BookingApp.jsx`
  - My Bookings: `frontend/src/apps/mybookings/MyBookings.jsx`
  - Admin: `frontend/src/apps/admin/AdminApp.jsx`
  - Settings: `frontend/src/apps/settings/SettingsApp.jsx`
  - Analytics: `frontend/src/apps/analytics/AnalyticsApp.jsx`
- Auth state/context: `frontend/src/context/AuthContext.jsx`
- API services: `frontend/src/services/*.js`
- Data hooks: `frontend/src/hooks/*.js`

### Request flow (simplified)

1. React app calls service modules in `frontend/src/services/`.
2. Services hit Django API endpoints (default `/api/*`).
3. Django viewsets handle business logic and DB access.
4. Session auth + CSRF protects authenticated endpoints.

## Testing

- Backend: Django test runner
  - `make test-backend` (recommended)
  - `python manage.py test`
  - or `docker compose exec web python manage.py test`
- Frontend: Vitest
  - `make test-frontend` (recommended)
  - `npm run test`
  - `npm run test:run`

Note: LDAP-specific auth tests are currently intentionally skipped while LDAP auth behavior is under active changes.

## Current status and production note

This repository is currently configured for development usage.

- Development-friendly defaults are in place (for example, debug-oriented settings and local origins).
- A full production deployment/preparation guide is not included yet.

We should add a dedicated production section later (hardening settings, secrets management, static/media strategy, TLS, deployment topology, backups, monitoring, etc.).
