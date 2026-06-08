# RoBoGo Learning Portal

MVP foundation for the RoBoGo classroom learning portal.

## Current Technology Stack

- Frontend: static HTML/CSS/JavaScript in `public/index.html`
- Backend: FastAPI in `backend/app`
- Local persistence: SQLite in `data/robogo-learning-portal.sqlite3`
- Preview runtime: local Python 3.11 virtual environment in `.venv311`

The original Node prototype is still present in `server.mjs`, but the active preview stack now uses FastAPI plus SQLite-backed local persistence.

## Local Database Configuration

Copy `.env.example` to `.env` if you want to override the local defaults.

```bash
cp .env.example .env
```

Default local values:

```text
ROBOGO_DATABASE_PROVIDER=sqlite
ROBOGO_SQLITE_PATH=data/robogo-learning-portal.sqlite3
ROBOGO_PORT=3001
```

The config file still keeps SQL Server fields for a future migration path, but the current app persists teacher dashboard data to SQLite.

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

Teacher Dashboard Step 2 currently supports:

- create students
- create classes
- add students to classes
- generate term sessions
- delete sessions

## Database Endpoints

Teacher-only database config check:

```text
GET /api/config/database
```

Health check:

```text
GET /api/health
```
