# RoBoGo Learning Portal

MVP foundation for the RoBoGo classroom learning portal.

## Current Technology Stack

- Frontend: static HTML/CSS/JavaScript in `apps/learning-portal/public/index.html`
- Backend: FastAPI in `apps/learning-portal/backend/app`
- Local persistence: PostgreSQL database `RoBoGoLearningSystemDB`
- Preview runtime: local Python 3.11 virtual environment in the repository root `.venv311`

The original Node prototype is still present in `server.mjs`, but the active preview stack now uses FastAPI plus PostgreSQL-backed local persistence.

## Local Database Configuration

Copy `apps/learning-portal/.env.example` to either root `.env` or `apps/learning-portal/.env` if you want to override the local defaults.

```bash
cp apps/learning-portal/.env.example .env
```

Default local values:

```text
ROBOGO_DATABASE_PROVIDER=postgresql
ROBOGO_DB_HOST=127.0.0.1
ROBOGO_DB_PORT=5488
ROBOGO_DB_NAME=RoBoGoLearningSystemDB
ROBOGO_DB_USER=postgres
ROBOGO_DB_PASSWORD=
ROBOGO_CLASSROOM_LATITUDE=
ROBOGO_CLASSROOM_LONGITUDE=
ROBOGO_ALLOWED_RADIUS_METERS=100
ROBOGO_ATTENDANCE_GRACE_PERIOD_MINUTES=10
ROBOGO_MATERIALS_STORAGE_ROOT=storage/materials
ROBOGO_PORT=3001
```

The app can still be pointed at SQLite for local fallback by setting `ROBOGO_DATABASE_PROVIDER=sqlite`, but the current default is local PostgreSQL.
Set `ROBOGO_CLASSROOM_LATITUDE` and `ROBOGO_CLASSROOM_LONGITUDE` in `.env` to enable verified attendance from browser location.
Uploaded materials are stored locally under `storage/materials/<type>/...` by default, and you can override the root with `ROBOGO_MATERIALS_STORAGE_ROOT`.

## Run the FastAPI Backend

Install dependencies into the local Python 3.11 environment:

```bash
python3.11 -m venv .venv311
.venv311/bin/pip install -r apps/learning-portal/backend/requirements.txt
```

Start the app:

```bash
cd apps/learning-portal
npm start
```

Or from the repository root:

```bash
npm run start:learning
```

Open:

```text
http://127.0.0.1:3001
```

Demo accounts:

```text
teacher@robogo.local / Teacher123!
student@robogo.local / Student123!
```

## Current Scope

The current MVP supports:

- create students
- create classes
- add students to classes
- generate term sessions
- delete sessions
- upload material files with automatic local storage paths by type
- assign material to a class session
- assign material to an individual student
- show students their current lesson materials during an active session
- show students historical review materials after sessions end
- record material view history
- verify attendance once per session when current lesson open, session time, and classroom location all match

## Database Endpoints

Teacher-only database config check:

```text
GET /api/config/database
```

Health check:

```text
GET /api/health
```
