# RoBoGo Learning System

This repository contains two independently started applications:

- `apps/learning-portal` - the classroom learning portal for teachers and students
- `apps/assembly-step-studio` - the 3D assembly step authoring studio

Shared product documents remain in `doc/`. Local runtime data, uploaded materials, and logs belong inside the app that owns them.

## Project Layout

```text
RoBoGo Learning system/
  apps/
    learning-portal/        # FastAPI + static portal UI
      backend/
      public/
      scripts/
      data/                 # local only, git-ignored
      storage/              # local uploads/previews, git-ignored
      logs/                 # local only, git-ignored
    assembly-step-studio/   # Next.js 3D model lesson authoring tool
      app/
      components/
      lib/
      store/
      public/
  doc/                      # source requirements and product notes
  PROJECT_HANDOFF.md        # current progress and next-step notes
  package.json              # root convenience commands
```

## Start Learning Portal

The learning portal runs at `http://127.0.0.1:3001`.

```bash
cd "/Users/happyfamily/Hector/VEX/RoBoGo Learning system"
python3.11 -m venv .venv311
.venv311/bin/pip install -r apps/learning-portal/backend/requirements.txt
npm run start:learning
```

Default database target is local PostgreSQL database `RoBoGoLearningSystemDB`. Put overrides in either root `.env` or `apps/learning-portal/.env`.

Demo accounts:

```text
teacher@robogo.local / Teacher123!
student@robogo.local / Student123!
```

## Start Assembly Step Studio

The 3D assembly authoring tool runs at `http://localhost:3000`.

```bash
cd "/Users/happyfamily/Hector/VEX/RoBoGo Learning system"
npm --prefix apps/assembly-step-studio install
npm run start:assembly
```

## Useful Commands

```bash
npm run start:learning     # FastAPI portal on 127.0.0.1:3001
npm run start:assembly     # Next.js 3D studio on localhost:3000
npm run verify:learning    # targeted portal smoke check
npm run lint:assembly      # Next.js lint
npm run build:assembly     # Next.js production build check
```

For more app-specific details, see:

- `apps/learning-portal/README.md`
- `apps/assembly-step-studio/README.md`
