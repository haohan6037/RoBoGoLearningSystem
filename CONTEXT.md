# RoBoGo Learning System

RoBoGo Learning System helps educators create robot models and turn completed models into student-facing building guidance.

## Language

**Assembly Project**:
A saved editable robot model made from library parts, including each part's placement and connection relationships.
_Avoid_: Assembly tool, model project

**Build Instructions Project**:
A project that starts from a completed model and contains its disassembly sequence plus the generated student build sequence.
_Avoid_: Disassembly project, steps project, assembly project

**Start Build Instructions**:
The transition that creates a new independent Build Instructions Project from the current Assembly Project. The source Assembly Project remains unchanged.
_Avoid_: Convert project, open disassembly

**Engineering Team**:
A student competition team for one VEX IQ season. It is separate from a teaching Class Group. Its team number and season never change after creation; its display name and Active/Archived status may change.
_Avoid_: Class, course team

**Personal Engineering Record**:
An independently timestamped, editable account written by an Engineering Team member whenever competition work occurs. A member may create multiple records per day. It captures the objective, completed work, reasoning, alternatives considered, evidence, outcome, problems, resolution state, and next steps.
_Avoid_: Draft version, submitted record, locked record, final notebook page, teacher note

**Competition**:
The area where Teachers manage season Engineering Teams and students maintain Personal Engineering Records independently of Classes and Class Sessions.
_Avoid_: Class management, attendance, lesson notes

**Merge Proposal**:
A student-authored candidate Team Engineering Notebook Entry assembled at a meaningful project stage from one or more saved Personal Engineering Records. Each source author confirms it before publication.
_Avoid_: AI summary, automatic merge

**Team Engineering Notebook Entry**:
An append-only entry published by the Engineering Team's Notebooker after every source author has confirmed the Merge Proposal.
_Avoid_: Editable report, presentation page

## Engineering Notebook Product Decisions

- Competition Engineering Notebook work has priority during competition season; general Academy classroom notes remain separate and deferred.
- Competition records never require a Class or Class Session. Each record is independent, continuously editable, and uses one Save action; students may create multiple records per day.
- A student may have only one active Engineering Team membership per season. Moving teams preserves old-team records as read-only history.
- Teachers alone create and edit teams or adjust members. Students edit only their own active-team records; Teachers have read-only oversight.
- Team deletion is unavailable. Team number and season are immutable; team name and Active/Archived status are editable.
- Phase one does not distinguish member roles and hides Stage Merge, confirmation, and publication.
- Records are never permanently deleted. Students may discard and restore their own active-team records; discarded records are excluded from PDF export.
- The final PDF should use the official VEX IQ Engineering Notebook structure for the active competition season. The system generates framework/template content; students fill only the corresponding evidence and reflection fields.
- The phase-one team PDF aggregates active Personal Engineering Records chronologically and preserves author, timestamps, fields, and evidence without rewriting student content.

## Example dialogue

> Educator: I finished the robot in my Assembly Project.
>
> Developer: Use Start Build Instructions. It creates a separate Build Instructions Project, where you can define the disassembly sequence and generate the student build sequence.
