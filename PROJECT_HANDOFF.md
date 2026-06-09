# RoBoGo Learning Portal Handoff

Last updated: 2026-06-09

## Open The Next Session Here

Project directory:
`/Users/happyfamily/Hector/VEX/RoBoGo Learning system`

Important: the old Codex thread was originally bound to a moved directory. For the cleanest next session, open the new session directly in the project directory above.

## Git State

- Repository: `https://github.com/haohan6037/RoBoGoLearningSystem.git`
- Branch: `codex/portal-foundation`
- Latest commit: pending current local commit

## What Is Already Built

### Foundation

- FastAPI backend scaffold in `backend/app`
- Static frontend shell in `public/index.html`
- Teacher and student login flow
- Role-based route and API protection
- Local preview startup through `npm start`

### Teacher Dashboard Step 2

Implemented and working:

- Create students
- Create classes
- Add students to classes
- Generate term sessions from weekly schedule
- Delete sessions

### Material Library And Assignment Step 3

Implemented and working:

- Create material metadata records
- List material library items in the teacher dashboard
- Assign materials to a class session for the whole class
- Assign materials to an individual student, with backend membership validation
- Show assigned materials on session cards

### Student Current Lesson And Review Step 4

Implemented and working:

- Student current lesson payload from assigned materials
- Current-session lookup for logged-in student based on active class membership
- Review list for previously assigned materials
- Student visibility restricted to active class memberships, class assignments, and personal assignments

### Persistence

Teacher dashboard and student learning data are no longer stored only in memory.

Current persistence:
- Local PostgreSQL database: `RoBoGoLearningSystemDB`

Current persisted entities:
- `users`
- `student_profiles`
- `class_groups`
- `class_memberships`
- `class_sessions`
- `materials`
- `session_material_assignments`

Note: session tokens are still runtime memory only, which is acceptable for the current local MVP stage.

## Current Runtime

Start command:
```bash
npm start
```

Current preview URL:
`http://127.0.0.1:3001`

Reason for port 3001:
- Port 3000 was already in use on this machine, so the project startup was aligned to 3001.

Python runtime:
- local venv: `.venv311`
- startup uses Python 3.11 to avoid Python 3.14 dependency compatibility problems

## Important Files

- `backend/app/main.py`
  Main FastAPI app, teacher APIs, student current/review APIs, login flow, persistence logic
- `backend/app/config.py`
  Runtime config and database provider settings
- `backend/requirements.txt`
  Python runtime dependencies
- `public/index.html`
  Full current frontend, including teacher Step 2 UI
- `package.json`
  Startup script pointing to FastAPI on port 3001
- `.env.example`
  Runtime environment template
- `README.md`
  Updated local run instructions and current scope summary
- `server.mjs`
  Old Node prototype kept for reference only; not the active stack

## Current Architecture Snapshot

Frontend:
- plain HTML/CSS/JS
- teacher dashboard and student portal live in one static page shell

Backend:
- FastAPI
- in-process auth token map for local sessions
- PostgreSQL-backed teacher and student learning data persistence

Database direction:
- current default provider is local PostgreSQL
- local database name is `RoBoGoLearningSystemDB`
- SQLite remains available as a fallback by setting `ROBOGO_DATABASE_PROVIDER=sqlite`

## What Was Verified

Verified during this session:
- Python backend syntax passes
- Frontend script syntax passes
- PostgreSQL database `RoBoGoLearningSystemDB` was created locally
- PostgreSQL tables are created by app startup
- Teacher login/dashboard data can be read from PostgreSQL
- Teacher material/session assignment write flow works against PostgreSQL
- Student current lesson and review payloads work against PostgreSQL
- Temporary verification records were cleaned after checks

## Known Limitations

- No file upload flow yet
- No attendance verification yet
- No real database migration framework yet
- Auth is still local MVP-level and not suitable for production
- Demo login accounts remain in code for local development

## Recommended Next Development Steps

### Step 5: Attendance Verification

Build next:
- material open record
- view history
- session-time check
- location-gated attendance creation
- duplicate attendance prevention

## Suggested Skills

If a fresh Codex session continues this project, these skills are the best fit:

- `codex-cost-saving-router`
  Use first for task sizing and restrained repo scanning
- `handoff`
  Use again when ending the next development block
- `diagnose`
  Use when FastAPI, startup, or browser behavior breaks unexpectedly

## Practical Notes For The Next Agent

- Treat `server.mjs` as legacy prototype context, not the active backend
- Keep changes centered on `backend/app/main.py` and `public/index.html` unless the next step justifies extracting modules
- Keep secrets in local `.env`, not in tracked docs or examples
- If local preview fails, first check whether port 3001 is free and whether `.venv311` is still intact

## Resume Prompt Suggestion

A strong next-session prompt would be:

"Read `PROJECT_HANDOFF.md`, inspect the current FastAPI + PostgreSQL implementation, and continue with Step 5: attendance verification."
