# RoBoGo Learning Portal

MVP foundation for the RoBoGo classroom learning portal.

## Current Technology Stack

- Frontend: static HTML/CSS/JavaScript in `public/index.html`
- Backend: FastAPI in `backend/app`
- Local persistence: PostgreSQL database `RoBoGoLearningSystemDB`
- Preview runtime: local Python 3.11 virtual environment in `.venv311`

The original Node prototype is still present in `server.mjs`, but the active preview stack now uses FastAPI plus PostgreSQL-backed local persistence.

## Local Database Configuration

Copy `.env.example` to `.env` if you want to override the local defaults.

```bash
cp .env.example .env
```

Default local values:

```text
ROBOGO_DATABASE_PROVIDER=postgresql
ROBOGO_DB_HOST=127.0.0.1
ROBOGO_DB_PORT=5432
ROBOGO_DB_NAME=RoBoGoLearningSystemDB
ROBOGO_DB_USER=postgres
ROBOGO_DB_PASSWORD=
ROBOGO_PORT=3001
```

The app can still be pointed at SQLite for local fallback by setting `ROBOGO_DATABASE_PROVIDER=sqlite`, but the current default is local PostgreSQL.

## Run the FastAPI Backend

Install dependencies into the local Python 3.11 environment:

```bash
python3.11 -m venv .venv311
.venv311/bin/pip install -r backend/requirements.txt
```

Start the app:

```bash
npm start
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
- create material metadata records
- assign material to a class session
- assign material to an individual student
- show students their current lesson materials during an active session
- show students historical review materials after sessions end

## Database Endpoints

Teacher-only database config check:

```text
GET /api/config/database
```

Health check:

```text
GET /api/health
```
