# RoBoGo Learning Portal Handoff

Last updated: 2026-08-07

## Current State: Competition Module Phase One (2026-08-09)

- Competition is now independent from Classes and Class Sessions. Active team members can create multiple separately timestamped Engineering Records per day and keep editing their own records.
- Added additive storage in `competition_engineering_records` and `competition_engineering_record_attachments`. Existing legacy `engineering_notes` rows are copied once using `legacy_note_id`; old tables remain for compatibility and rollback safety.
- Teacher APIs support team creation, editable name/status, member add, and soft member removal. Team number and season are not accepted by the update API. A student can have only one active team per season.
- Removed role selection from the UI. Stage Merge, confirmation, and publication are hidden and their write APIs return HTTP 410 during phase one.
- Students can discard/restore records. Former members retain read-only access to their own historical records; Teachers see all team records read-only.
- Team PDF now aggregates active personal records chronologically and excludes discarded records while retaining authorship and timestamps.
- Targeted integration tests cover class-independent multiple records, team constraints/former-member history, discard/restore, and PDF exclusion.
- Real preview SQLite migration completed after backup at `apps/learning-portal/.codex-backups/20260809-competition-module/engineering-notebook-preview.sqlite3.before-competition-migration`.
- Portal restarted on `0.0.0.0:3002`; current checked LAN address is `192.168.68.119`.

## Current State: Engineering Notebook UX + LAN Preview (2026-08-07)

- The active Engineering Notebook implementation is isolated in `/Users/happyfamily/Hector/VEX/robogo-engineering-notebook-wt` on branch `codex/engineering-notebook-mvp`; its changes are intentionally uncommitted.
- Current product rule: every Engineering Team member has one editable record per class session. There is one `Save` action, no submission lock, no per-session version list, and no `Personal and Team Source Records` UI section.
- Selecting a class session loads that student's existing record for continued editing. The legacy submit endpoint remains compatibility-only and keeps the record editable.
- A saved record captures: Objective, work completed, reasoning, alternatives considered, test evidence, outcome, problems, resolution state, resolution or unresolved reason, and next steps. `Objective or problem` was shortened to `Objective` to reduce ambiguity for children.
- Stage Merge remains available for meaningful project milestones. Students author the proposal; source authors confirm; the Notebooker publishes an append-only team entry. The system must not rewrite or automatically merge student text.
- Final PDF export is intended to follow the official VEX IQ Engineering Notebook structure for the active season, with RoBoGo generating framework text and students supplying the corresponding content.
- Student and teacher portal routes are served by the FastAPI app. Assembly Studio is a separate Next.js app that supports shared 3D model and Build Instructions authoring.

### LAN Runtime Status

- Last live verification was 2026-08-06: Learning Portal on port `3002` and Assembly Studio on port `3003`, both bound to `0.0.0.0` and returning HTTP 200 through the then-current LAN IP.
- Rechecked 2026-08-07 09:53 NZST: the Mac LAN IP had changed to `192.168.68.119`, and neither service was running. Never hand out a remembered IP without rechecking it.
- Start the Learning Portal from the feature worktree:
  ```bash
  cd "/Users/happyfamily/Hector/VEX/robogo-engineering-notebook-wt/apps/learning-portal"
  ROBOGO_DATABASE_PROVIDER=sqlite \
  ROBOGO_SQLITE_PATH=data/engineering-notebook-preview.sqlite3 \
  ROBOGO_MATERIALS_STORAGE_ROOT=storage/engineering-notebook-preview \
  ../../.venv-notebook-run/bin/python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 3002
  ```
- Start Assembly Studio from the main checkout:
  ```bash
  cd "/Users/happyfamily/Hector/VEX/RoBoGo Learning system/apps/assembly-step-studio"
  npm run start -- --hostname 0.0.0.0 --port 3003
  ```
- Resolve the current Wi-Fi address with `ipconfig getifaddr en1` (fall back to `en0`), then verify `/student`, `/api/health`, `/`, and `/api/studio` through that address before sharing URLs.
- These are foreground/local services, not Dockerized or configured for restart after reboot. Keep the Mac awake and the processes running.
- LAN exposure is acceptable for preview, but direct Internet exposure is not: portal authentication is still local-MVP quality, and Assembly Studio has no account/permission isolation. Any LAN user with the Studio URL may modify shared projects.

## Previous Update: Competition Engineering Notebook MVP (2026-08-05)

- Development is isolated on `codex/engineering-notebook-mvp` in `/Users/happyfamily/Hector/VEX/robogo-engineering-notebook-wt`.
- Added season-scoped Engineering Teams, member/Notebooker roles, and per-member session submission coverage.
- Students can save and continuously edit one Personal Engineering Record per class session and attach image/PDF evidence.
- Students can manually author Merge Proposals from saved source records. Every source author must confirm before the team Notebooker can publish.
- Published Team Engineering Notebook Entries are append-only, retain source attribution, and export as a deterministic PDF with the 2026–2027 Level Up manual/rubric version metadata.
- Teachers can create teams, assign roles, monitor individual submission status, inspect proposals and published entries, and download the PDF; teacher UI has no notebook edit controls.
- AI generation, rewriting, summarization, and auto-merging are intentionally absent to preserve student authorship.
- Targeted API integration tests live at `apps/learning-portal/tests/test_engineering_notebook_api.py`.
- General Academy classroom notes remain a separate follow-up item below.

## Latest Update: Assembly Studio Project Persistence + Dashboard Polish

- Assembly Studio now starts from a dedicated local Projects dashboard instead of dropping straight into the editor
- Added project-level local persistence in IndexedDB:
  - each project has its own ID and shareable local designer link
  - uploaded model blobs are stored with the project
  - disassembly steps and generated assembly steps are restored when reopening the same project
- Added project actions:
  - `Designer`
  - `Duplicate`
  - `Copy Link`
  - `Delete`
- Fixed a save-state bug where uploaded models were not persisted after reload because the workspace never re-entered a saveable hydrated state
- Tightened the project table layout:
  - stable dashboard work-area height
  - header/data column alignment via shared table columns
  - action menu overflow behavior improved for short project lists
- 3D authoring improvements completed in this cycle before dashboard work:
  - hidden parts are no longer selectable
  - hover highlighting added
  - project import/remap is tied to stable model keys instead of volatile runtime UUIDs
  - right mouse button is reserved for camera orbit/pan while left mouse is focused on part operations

### Immediate Next Assembly Pass
1. Add upward-opening dropdown behavior near the bottom of the project list
2. Add a visible "Saved just now" state in the studio shell
3. Continue smoothing multi-part drag behavior toward a more Cadasio-like feel
4. Decide whether project metadata should later sync into the learning portal material workflow

## Previous Update: Repository Structure Cleanup

- Split the repository into two app roots:
  - `apps/learning-portal` for the FastAPI classroom portal
  - `apps/assembly-step-studio` for the Next.js 3D authoring studio
- Added a root `package.json` with clear convenience commands:
  - `npm run start:learning`
  - `npm run start:assembly`
  - `npm run verify:learning`
- Updated backend static/data paths so the learning portal can run cleanly after moving under `apps/learning-portal`
- Root `README.md` now documents the overall structure and startup commands

## Previous Update: Preview + Visual Refresh

### Material Preview Direction
- Moved away from browser-native `.pptx` preview because it was blank or degraded across browsers
- Local environment now has `LibreOffice` installed via Homebrew cask for stable presentation conversion
- Current direction: `PPT/PPTX -> PDF preview`, then embed PDF in the portal preview layer
- This is the correct cross-browser path if the goal is "view in portal without relying on Quick Look HTML"

### UI Styling Refresh
- `apps/learning-portal/public/css/app.css` was rewritten to move the portal toward an Arcade-inspired SaaS visual style
- Updated design language:
  - lighter warm page background
  - glassy white surfaces
  - softer shadows
  - cleaner rounded controls
  - less prototype-like classroom and dashboard surfaces
- Sidebar palette was subsequently lightened because the first pass was too dark relative to the main content area

### Immediate Next Design Pass
1. Continue refining sidebar/content visual balance
2. Tighten spacing and typography across student/teacher views
3. Improve topbar / page heading hierarchy
4. Standardize inline styles still embedded in `apps/learning-portal/public/js/app.js`

## Session Summary

This session transformed the RoBoGo Learning Portal from a basic MVP into a full-featured classroom management system. All delete operations are soft-deletes. The teacher dashboard is organized into 7 functional pages. Students get a live classroom experience with phase-aware content.

## Architecture

- **Backend**: FastAPI (`apps/learning-portal/backend/app/main.py` ~2320 lines)
- **Frontend**: Single-page HTML/CSS/JS (`apps/learning-portal/public/index.html` ~2820 lines)
- **Database**: PostgreSQL `RoBoGoLearningSystemDB` (SQLite fallback)
- **Runtime**: root `.venv311/bin/python` (Python 3.11), `npm run start:learning` → `http://127.0.0.1:3001`

## What Was Built This Session

### Step 6: Material Management + Attendance Detail
- Teacher material actions: edit metadata, replace file, delete (soft-delete with `is_deleted`)
- Teacher attendance detail panel per session with verified/absent/location-failed breakdown
- File upload feedback (name + size display)

### Step 7: Session Lifecycle + Student Experience
- Session status management (Complete/Cancel via PUT endpoint)
- Student schedule view (upcoming sessions)
- Student attendance history
- Completed sessions auto-feed into Review materials

### Student Material Opening + Attendance Polish
- Files open in new browser tab (native PDF/image/video rendering) instead of forced download
- Clear attendance status feedback with emoji indicators
- Attendance status card shows real-time "Checked in / Not checked in"

### Classroom Experience
- Session `phase` system: `not_started` → `theory` → `building`
- Teacher controls phase via session cards or Classroom view
- Student sees live phase indicator with auto-polling (5s)
- Phase-aware material filtering (students see only relevant materials)

### Teacher Portal Reorganization
- Overview → pure dashboard (5 metric cards)
- Students page → create/edit/delete students, password management
- Classes page → create/edit classes, add students to class
- Sessions page → generate sessions, assign materials, all session actions
- Classroom page → live classroom monitor with attendance + materials panels
- Material Library → upload, edit, delete, replace materials
- Attendance page → per-session attendance detail

### Password System
- Teacher sets password when creating/editing students (or auto-generates)
- Removed from student portal (students contact teacher to reset)

### All Soft-Delete
- Session delete → `UPDATE status = 'cancelled'`
- Material delete → `UPDATE is_deleted = 1` (file + assignments preserved)

### Collapsible Forms
- Students/Classes/Sessions create forms hidden behind "＋" toggle buttons

### Phase-Tagged Materials
- Assign materials with phase label: Both / Theory only / Building only
- Student classroom filters by current phase
- Teacher classroom shows materials grouped by phase

### Final 6 Polish Items
1. Teacher manual check-in button
2. Teacher classroom auto-refresh (8s polling)
3. Student not_started phase shows material preview
4. Session completion summary panel
5. Material sort_order with move up/down API
6. Link-type materials (paste URL instead of uploading file)

## Database Migrations Added
- `phase` column on `class_sessions`
- `is_deleted` column on `materials`
- `phase_tag` column on `session_material_assignments`
- `sort_order` column on `session_material_assignments`

## API Endpoints Added (this session)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/teacher/materials/{id}` | PUT | Update material metadata |
| `/api/teacher/materials/{id}` | DELETE | Soft-delete material |
| `/api/teacher/materials/{id}/replace` | POST | Replace material file |
| `/api/teacher/sessions/{id}` | PUT | Update session status |
| `/api/teacher/sessions/{id}/phase` | PUT | Set classroom phase |
| `/api/teacher/sessions/{id}/classroom` | GET | Classroom aggregate data |
| `/api/teacher/sessions/{id}/students/{sid}/check-in` | POST | Manual attendance |
| `/api/teacher/students/{id}` | PUT | Edit student |
| `/api/teacher/students/{id}/reset-password` | POST | Reset student password |
| `/api/teacher/classes/{id}` | PUT | Edit class |
| `/api/teacher/assignments/{id}/move` | PUT | Reorder materials |
| `/api/me/password` | PUT | Change own password |
| `/api/student/schedule` | GET | Student upcoming sessions |
| `/api/student/attendance` | GET | Student attendance history |

## Demo Accounts
```
teacher@robogo.local / Teacher123!
student@robogo.local / Student123!
```

## Key Files
- `apps/learning-portal/backend/app/main.py` — All backend logic (~2320 lines)
- `apps/learning-portal/backend/app/config.py` — Runtime config
- `apps/learning-portal/backend/requirements.txt` — Python dependencies
- `apps/learning-portal/public/index.html` — Full frontend (~2820 lines)
- `package.json` — root convenience scripts
- `PROJECT_HANDOFF.md` — This file

## Known Limitations / Future Work

0. **Academy classroom notes remain a separate follow-up** — add general lesson notes after the competition-season Engineering Notebook minimum loop is stable; do not merge classroom notes into student-authored competition evidence.

1. **No real database migration framework** — startup-time ALTER TABLE with try/except
2. **Auth is local MVP level** — plain-text passwords, in-memory tokens
3. **Single monolithic file** — both main.py and index.html are very large, should be split
4. **No mobile optimization** — responsive basics exist but not tested on phones/tablets
5. **No portal website** — public-facing site for parents not yet built
6. **No drag-and-drop for sort** — only up/down API exists, no UI buttons yet
7. **No real-time WebSocket** — polling is used for classroom refresh
8. **No email/password recovery flow** — students must contact teacher to reset password
9. **No teacher attendance summary export** — data is viewable but not downloadable as CSV/Excel
10. **Link materials need `openMaterialFile` update** — the `isLink` parameter is not yet passed from the materials card context

## Running the Project
```bash
cd "/Users/happyfamily/Hector/VEX/RoBoGo Learning system"
npm run start:learning
# Opens at http://127.0.0.1:3001
```
