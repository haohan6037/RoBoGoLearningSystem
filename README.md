# RoBoGo Learning System

RoBoGo is a robotics education platform that combines a classroom learning portal with a browser-based 3D assembly studio. It is also a portfolio project demonstrating full-stack product development, geometry-aware tooling, and the conversion of hands-on engineering lessons into reusable software constraints.

> Portfolio status: public source code for review. No open-source license is currently granted. Third-party VEX names, trademarks, CAD files, and visual assets remain the property of their respective owners.

## Product Areas

### Learning Portal

- Teacher and student classroom workflows
- Courses, sessions, attendance, and learning materials
- Competition teams and student-authored engineering records
- FastAPI backend with a browser-based frontend

### Assembly Step Studio

- Editable 3D robot assemblies built from a part catalog
- Explicit connectors, mates, rigid groups, and build instructions
- STEP-based part rendering and geometry-aware validation
- Early deterministic AI-design experiments with constrained supported mechanisms
- Classroom publication flow for student-facing build guidance

## Engineering Highlights

- **Mechanical semantics, not visual placement alone.** Shafts, holes, gears, pins, and connectors are represented as relationships that can be validated.
- **Editable generated output.** Generated assemblies remain normal projects rather than flattened images or opaque AI results.
- **Verification boundaries.** Documentation distinguishes static geometry checks, motion sweeps, and physical validation instead of treating a successful render as proof of a buildable robot.
- **Student authorship protection.** Competition records remain student-authored; the platform does not rewrite them with AI.
- **Small, testable AI scope.** The current AI experiment supports a limited set of deterministic mechanisms and reports unsupported requests instead of inventing unverified assemblies.

## Structured Engineering Experience

The following records are written in English and structured for both human review and AI retrieval. Each document includes metadata, constraints, known failure modes, reusable rules, validation evidence, and explicitly unverified claims.

- [Dual Lift with Motorized Claw](doc/mechanical-assembly/dual-lift-motorized-claw-case-study.md)
- [2x30 Heavy Dual-Beam Lift](doc/mechanical-assembly/heavy-dual-beam-lift-2x30-case-study.md)
- [Assembly Structure Learning Log](doc/work-logs/2026-08-28-assembly-structure-learning-log.md)

These are engineering learning records, not official VEX build instructions and not claims of physical load capacity.

## Repository Layout

```text
apps/
  learning-portal/        FastAPI classroom and competition portal
  assembly-step-studio/   Next.js 3D assembly and instruction studio
doc/
  mechanical-assembly/    Structured mechanism case studies
  work-logs/              Engineering learning records
CONTEXT.md                 Shared product language and decisions
PROJECT_HANDOFF.md         Current development state
```

Local databases, uploaded files, generated projects, backups, logs, and environment files are intentionally excluded from Git.

## Run Locally

Prerequisites:

- Node.js and npm
- Python 3.11
- PostgreSQL for the learning portal

### Assembly Step Studio

```bash
npm --prefix apps/assembly-step-studio install
npm run start:assembly
```

Open `http://localhost:3000`.

### Learning Portal

```bash
python3.11 -m venv .venv311
.venv311/bin/pip install -r apps/learning-portal/backend/requirements.txt
npm run start:learning
```

The portal starts at `http://127.0.0.1:3001`. Copy the example environment configuration and provide your own local database settings before starting it.

## Verification Commands

```bash
npm run verify:learning
npm run lint:assembly
npm run build:assembly
```

Focused Assembly Studio tests are located beside the corresponding TypeScript modules. Run them from `apps/assembly-step-studio` so the test import aliases resolve against the app root.

## Scope and Attribution

This repository is an independent educational software project and is not affiliated with or endorsed by VEX Robotics. Product names and part numbers are used for identification and interoperability. Review third-party asset terms before redistributing CAD or visual assets outside this portfolio repository.
