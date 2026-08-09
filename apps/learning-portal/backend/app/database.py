"""Database layer."""
import sqlite3
from typing import Any, Optional

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:
    psycopg = None
    dict_row = None

from .config import get_settings
from .models import (
    User, StudentProfile, ClassGroup, ClassMembership, ClassSession,
    Material, MaterialStep, SessionMaterialAssignment, MaterialViewRecord, AttendanceRecord,
)
from .utils import now_utc, parse_date_value, parse_datetime_value, combine_session_datetime

settings = get_settings()

class DatabaseConnection:
    def __init__(self, connection: Any, provider: str):
        self.connection = connection
        self.provider = provider

    def __enter__(self) -> "DatabaseConnection":
        return self

    def __exit__(self, exc_type, exc_value, traceback) -> None:
        if exc_type is None:
            self.connection.commit()
        else:
            self.connection.rollback()
        self.connection.close()

    def execute(self, statement: str, parameters: tuple = ()):
        return self.connection.execute(self.prepare(statement), parameters)

    def executescript(self, script: str) -> None:
        for statement in script.split(";"):
            normalized = statement.strip()
            if normalized:
                self.execute(normalized)

    def prepare(self, statement: str) -> str:
        if self.provider == "postgresql":
            return statement.replace("?", "%s")
        return statement

def ensure_database_parent() -> None:
    settings.sqlite_file.parent.mkdir(parents=True, exist_ok=True)

def get_connection() -> DatabaseConnection:
    provider = settings.database_provider.lower()
    if provider == "sqlite":
        ensure_database_parent()
        connection = sqlite3.connect(settings.sqlite_file)
        connection.row_factory = sqlite3.Row
        return DatabaseConnection(connection, provider)

    if provider == "postgresql":
        if psycopg is None or dict_row is None:
            raise RuntimeError("PostgreSQL support requires installing psycopg. Run pip install -r backend/requirements.txt.")
        connection = psycopg.connect(settings.postgresql_connection_url, row_factory=dict_row)
        return DatabaseConnection(connection, provider)

    raise RuntimeError(f"Unsupported database provider: {settings.database_provider}")

def init_database() -> None:
    with get_connection() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password TEXT NOT NULL,
                role TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS student_profiles (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL UNIQUE,
                display_name TEXT NOT NULL,
                parent_name TEXT NOT NULL DEFAULT '',
                notes TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS class_groups (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                weekday INTEGER NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS class_memberships (
                id TEXT PRIMARY KEY,
                class_group_id TEXT NOT NULL,
                student_id TEXT NOT NULL,
                status TEXT NOT NULL,
                joined_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS class_sessions (
                id TEXT PRIMARY KEY,
                class_group_id TEXT NOT NULL,
                session_date TEXT NOT NULL,
                start_datetime TEXT NOT NULL,
                end_datetime TEXT NOT NULL,
                status TEXT NOT NULL,
                title TEXT NOT NULL DEFAULT '',
                phase TEXT NOT NULL DEFAULT 'not_started',
                created_at TEXT NOT NULL,
                UNIQUE(class_group_id, session_date)
            );

            CREATE TABLE IF NOT EXISTS materials (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                uploaded_by TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS material_steps (
                id TEXT PRIMARY KEY,
                material_id TEXT NOT NULL,
                step_number INTEGER NOT NULL,
                step_type TEXT NOT NULL,
                title TEXT NOT NULL,
                content TEXT NOT NULL DEFAULT '',
                attachment_url TEXT NOT NULL DEFAULT '',
                attachment_name TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                FOREIGN KEY (material_id) REFERENCES materials(id)
            );

            CREATE TABLE IF NOT EXISTS session_material_assignments (
                id TEXT PRIMARY KEY,
                class_session_id TEXT NOT NULL,
                material_id TEXT NOT NULL,
                assigned_to_type TEXT NOT NULL,
                assigned_to_student_id TEXT,
                assigned_by TEXT NOT NULL,
                phase_tag TEXT NOT NULL DEFAULT 'both',
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS material_view_records (
                id TEXT PRIMARY KEY,
                student_id TEXT NOT NULL,
                material_id TEXT NOT NULL,
                class_session_id TEXT,
                view_source TEXT NOT NULL,
                opened_at TEXT NOT NULL,
                location_status TEXT NOT NULL,
                latitude DOUBLE PRECISION,
                longitude DOUBLE PRECISION
            );

            CREATE TABLE IF NOT EXISTS attendance_records (
                id TEXT PRIMARY KEY,
                student_id TEXT NOT NULL,
                class_session_id TEXT NOT NULL,
                material_id TEXT NOT NULL,
                checked_in_at TEXT NOT NULL,
                method TEXT NOT NULL,
                location_status TEXT NOT NULL,
                latitude DOUBLE PRECISION,
                longitude DOUBLE PRECISION,
                created_at TEXT NOT NULL,
                UNIQUE(student_id, class_session_id)
            );

            CREATE TABLE IF NOT EXISTS engineering_teams (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                team_number TEXT NOT NULL,
                season TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'active',
                created_by TEXT NOT NULL,
                created_at TEXT NOT NULL,
                UNIQUE(team_number, season)
            );

            CREATE TABLE IF NOT EXISTS engineering_team_memberships (
                id TEXT PRIMARY KEY,
                team_id TEXT NOT NULL,
                student_id TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'member',
                status TEXT NOT NULL DEFAULT 'active',
                joined_at TEXT NOT NULL,
                UNIQUE(team_id, student_id),
                FOREIGN KEY (team_id) REFERENCES engineering_teams(id),
                FOREIGN KEY (student_id) REFERENCES student_profiles(id)
            );

            CREATE TABLE IF NOT EXISTS engineering_notes (
                id TEXT PRIMARY KEY,
                team_id TEXT NOT NULL,
                student_id TEXT NOT NULL,
                class_session_id TEXT NOT NULL,
                objective TEXT NOT NULL,
                work_completed TEXT NOT NULL,
                reasoning TEXT NOT NULL,
                alternatives TEXT NOT NULL DEFAULT '',
                test_evidence TEXT NOT NULL DEFAULT '',
                outcome TEXT NOT NULL,
                problems TEXT NOT NULL DEFAULT '',
                resolution_status TEXT NOT NULL,
                resolution TEXT NOT NULL DEFAULT '',
                unresolved_reason TEXT NOT NULL DEFAULT '',
                next_steps TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'draft',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                submitted_at TEXT,
                UNIQUE(team_id, student_id, class_session_id),
                FOREIGN KEY (team_id) REFERENCES engineering_teams(id),
                FOREIGN KEY (student_id) REFERENCES student_profiles(id),
                FOREIGN KEY (class_session_id) REFERENCES class_sessions(id)
            );

            CREATE TABLE IF NOT EXISTS engineering_note_attachments (
                id TEXT PRIMARY KEY,
                note_id TEXT NOT NULL,
                file_name TEXT NOT NULL,
                file_url TEXT NOT NULL,
                media_type TEXT NOT NULL,
                file_size INTEGER NOT NULL,
                uploaded_by TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (note_id) REFERENCES engineering_notes(id)
            );

            CREATE TABLE IF NOT EXISTS competition_engineering_records (
                id TEXT PRIMARY KEY,
                team_id TEXT NOT NULL,
                student_id TEXT NOT NULL,
                legacy_note_id TEXT UNIQUE,
                objective TEXT NOT NULL,
                work_completed TEXT NOT NULL,
                reasoning TEXT NOT NULL,
                alternatives TEXT NOT NULL DEFAULT '',
                test_evidence TEXT NOT NULL DEFAULT '',
                outcome TEXT NOT NULL,
                problems TEXT NOT NULL DEFAULT '',
                resolution_status TEXT NOT NULL,
                resolution TEXT NOT NULL DEFAULT '',
                unresolved_reason TEXT NOT NULL DEFAULT '',
                next_steps TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'active',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                discarded_at TEXT,
                FOREIGN KEY (team_id) REFERENCES engineering_teams(id),
                FOREIGN KEY (student_id) REFERENCES student_profiles(id)
            );

            CREATE TABLE IF NOT EXISTS competition_engineering_record_attachments (
                id TEXT PRIMARY KEY,
                record_id TEXT NOT NULL,
                file_name TEXT NOT NULL,
                file_url TEXT NOT NULL,
                media_type TEXT NOT NULL,
                file_size INTEGER NOT NULL,
                uploaded_by TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (record_id) REFERENCES competition_engineering_records(id)
            );

            CREATE TABLE IF NOT EXISTS engineering_merge_proposals (
                id TEXT PRIMARY KEY,
                team_id TEXT NOT NULL,
                class_session_id TEXT NOT NULL,
                title TEXT NOT NULL,
                objective TEXT NOT NULL,
                work_completed TEXT NOT NULL,
                reasoning TEXT NOT NULL,
                alternatives TEXT NOT NULL DEFAULT '',
                test_evidence TEXT NOT NULL DEFAULT '',
                outcome TEXT NOT NULL,
                problems TEXT NOT NULL DEFAULT '',
                resolution_status TEXT NOT NULL,
                resolution TEXT NOT NULL DEFAULT '',
                unresolved_reason TEXT NOT NULL DEFAULT '',
                next_steps TEXT NOT NULL DEFAULT '',
                proposed_by TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                sequence_number INTEGER,
                created_at TEXT NOT NULL,
                published_at TEXT,
                UNIQUE(team_id, sequence_number),
                FOREIGN KEY (team_id) REFERENCES engineering_teams(id),
                FOREIGN KEY (class_session_id) REFERENCES class_sessions(id),
                FOREIGN KEY (proposed_by) REFERENCES student_profiles(id)
            );

            CREATE TABLE IF NOT EXISTS engineering_merge_sources (
                id TEXT PRIMARY KEY,
                proposal_id TEXT NOT NULL,
                note_id TEXT NOT NULL,
                UNIQUE(proposal_id, note_id),
                UNIQUE(note_id),
                FOREIGN KEY (proposal_id) REFERENCES engineering_merge_proposals(id),
                FOREIGN KEY (note_id) REFERENCES engineering_notes(id)
            );

            CREATE TABLE IF NOT EXISTS engineering_merge_confirmations (
                id TEXT PRIMARY KEY,
                proposal_id TEXT NOT NULL,
                student_id TEXT NOT NULL,
                confirmed_at TEXT NOT NULL,
                UNIQUE(proposal_id, student_id),
                FOREIGN KEY (proposal_id) REFERENCES engineering_merge_proposals(id),
                FOREIGN KEY (student_id) REFERENCES student_profiles(id)
            );
            """
        )

        connection.execute(
            """
            INSERT INTO competition_engineering_records (
                id, team_id, student_id, legacy_note_id, objective, work_completed, reasoning,
                alternatives, test_evidence, outcome, problems, resolution_status, resolution,
                unresolved_reason, next_steps, status, created_at, updated_at, discarded_at
            )
            SELECT 'competition-' || id, team_id, student_id, id, objective, work_completed, reasoning,
                   alternatives, test_evidence, outcome, problems, resolution_status, resolution,
                   unresolved_reason, next_steps, 'active', created_at, updated_at, NULL
            FROM engineering_notes legacy
            WHERE NOT EXISTS (
                SELECT 1 FROM competition_engineering_records record
                WHERE record.legacy_note_id = legacy.id
            )
            """
        )
        connection.execute(
            """
            INSERT INTO competition_engineering_record_attachments (
                id, record_id, file_name, file_url, media_type, file_size, uploaded_by, created_at
            )
            SELECT 'competition-' || attachment.id, 'competition-' || attachment.note_id,
                   attachment.file_name, attachment.file_url, attachment.media_type,
                   attachment.file_size, attachment.uploaded_by, attachment.created_at
            FROM engineering_note_attachments attachment
            WHERE EXISTS (
                SELECT 1 FROM competition_engineering_records record
                WHERE record.id = 'competition-' || attachment.note_id
            )
              AND NOT EXISTS (
                SELECT 1 FROM competition_engineering_record_attachments migrated
                WHERE migrated.id = 'competition-' || attachment.id
            )
            """
        )

        existing_users = connection.execute("SELECT COUNT(*) AS count FROM users").fetchone()["count"]
        if existing_users:
            return

        created_at = now_utc().isoformat()
        connection.execute(
            "INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)",
            ("teacher-1", "RoBoGo Teacher", "teacher@robogo.local", "Teacher123!", "Teacher"),
        )
        connection.execute(
            "INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)",
            ("student-1", "Demo Student", "student@robogo.local", "Student123!", "Student"),
        )
        connection.execute(
            """
            INSERT INTO student_profiles (id, user_id, display_name, parent_name, notes, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            ("student-profile-1", "student-1", "Demo Student", "", "", created_at),
        )

def row_to_user(row: sqlite3.Row) -> User:
    return User(**dict(row))

def row_to_student_profile(row: sqlite3.Row) -> StudentProfile:
    return StudentProfile(
        id=row["id"],
        user_id=row["user_id"],
        display_name=row["display_name"],
        parent_name=row["parent_name"],
        notes=row["notes"],
        created_at=parse_datetime_value(row["created_at"]),
    )

def row_to_class_group(row: sqlite3.Row) -> ClassGroup:
    return ClassGroup(
        id=row["id"],
        name=row["name"],
        description=row["description"],
        weekday=row["weekday"],
        start_time=row["start_time"],
        end_time=row["end_time"],
        status=row["status"],
        created_at=parse_datetime_value(row["created_at"]),
    )

def row_to_class_membership(row: sqlite3.Row) -> ClassMembership:
    return ClassMembership(
        id=row["id"],
        class_group_id=row["class_group_id"],
        student_id=row["student_id"],
        status=row["status"],
        joined_at=parse_datetime_value(row["joined_at"]),
    )

def row_to_class_session(row: sqlite3.Row) -> ClassSession:
    return ClassSession(
        id=row["id"],
        class_group_id=row["class_group_id"],
        session_date=parse_date_value(row["session_date"]),
        start_datetime=parse_datetime_value(row["start_datetime"]),
        end_datetime=parse_datetime_value(row["end_datetime"]),
        status=row["status"],
        title=row["title"],
        phase=row["phase"],
        created_at=parse_datetime_value(row["created_at"]),
    )

def row_to_material(row: sqlite3.Row) -> Material:
    return Material(
        id=row["id"],
        title=row["title"],
        description=row["description"],
        uploaded_by=row["uploaded_by"],
        created_at=parse_datetime_value(row["created_at"]),
        updated_at=parse_datetime_value(row["updated_at"]),
    )

def row_to_material_step(row: sqlite3.Row) -> MaterialStep:
    return MaterialStep(
        id=row["id"],
        material_id=row["material_id"],
        step_number=row["step_number"],
        step_type=row["step_type"],
        title=row["title"],
        content=row["content"],
        attachment_url=row["attachment_url"],
        attachment_name=row["attachment_name"],
        created_at=parse_datetime_value(row["created_at"]),
    )

def row_to_assignment(row: sqlite3.Row) -> SessionMaterialAssignment:
    return SessionMaterialAssignment(
        id=row["id"],
        class_session_id=row["class_session_id"],
        material_id=row["material_id"],
        assigned_to_type=row["assigned_to_type"],
        assigned_to_student_id=row["assigned_to_student_id"],
        assigned_by=row["assigned_by"],
        phase_tag=row["phase_tag"],
        created_at=parse_datetime_value(row["created_at"]),
    )

def row_to_material_view_record(row: sqlite3.Row) -> MaterialViewRecord:
    return MaterialViewRecord(
        id=row["id"],
        student_id=row["student_id"],
        material_id=row["material_id"],
        class_session_id=row["class_session_id"],
        view_source=row["view_source"],
        opened_at=parse_datetime_value(row["opened_at"]),
        location_status=row["location_status"],
        latitude=row["latitude"],
        longitude=row["longitude"],
    )

def row_to_attendance_record(row: sqlite3.Row) -> AttendanceRecord:
    return AttendanceRecord(
        id=row["id"],
        student_id=row["student_id"],
        class_session_id=row["class_session_id"],
        material_id=row["material_id"],
        checked_in_at=parse_datetime_value(row["checked_in_at"]),
        method=row["method"],
        location_status=row["location_status"],
        latitude=row["latitude"],
        longitude=row["longitude"],
        created_at=parse_datetime_value(row["created_at"]),
    )

def find_user_by_email(email: str) -> Optional[User]:
    normalized = email.strip().lower()
    with get_connection() as connection:
        row = connection.execute(
            "SELECT id, name, email, password, role FROM users WHERE lower(email) = ?",
            (normalized,),
        ).fetchone()
    return row_to_user(row) if row else None

def get_student_profile(student_id: str) -> StudentProfile:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT id, user_id, display_name, parent_name, notes, created_at
            FROM student_profiles
            WHERE id = ?
            """,
            (student_id,),
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Student not found.")
    return row_to_student_profile(row)

def get_student_profile_for_user(user_id: str) -> StudentProfile:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT id, user_id, display_name, parent_name, notes, created_at
            FROM student_profiles
            WHERE user_id = ?
            """,
            (user_id,),
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Student profile not found.")
    return row_to_student_profile(row)

def get_class_group(class_id: str) -> ClassGroup:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT id, name, description, weekday, start_time, end_time, status, created_at
            FROM class_groups
            WHERE id = ?
            """,
            (class_id,),
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Class not found.")
    return row_to_class_group(row)

def get_class_session(session_id: str) -> ClassSession:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT id, class_group_id, session_date, start_datetime, end_datetime, status, title, phase, created_at
            FROM class_sessions
            WHERE id = ?
            """,
            (session_id,),
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Session not found.")
    return row_to_class_session(row)

def get_material(material_id: str) -> Material:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT id, title, description, uploaded_by, created_at, updated_at
            FROM materials
            WHERE id = ?
            """,
            (material_id,),
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Material not found.")
    return row_to_material(row)

def get_material_steps(material_id: str) -> list[MaterialStep]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT id, material_id, step_number, step_type, title, content,
                   attachment_url, attachment_name, created_at
            FROM material_steps
            WHERE material_id = ?
            ORDER BY step_number ASC
            """,
            (material_id,),
        ).fetchall()
    return [row_to_material_step(row) for row in rows]

def get_material_step(step_id: str) -> MaterialStep:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT id, material_id, step_number, step_type, title, content,
                   attachment_url, attachment_name, created_at
            FROM material_steps
            WHERE id = ?
            """,
            (step_id,),
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Step not found.")
    return row_to_material_step(row)

def _migrate_add_phase_column() -> None:
    """Add phase column to existing class_sessions table if missing."""
    try:
        with get_connection() as connection:
            if connection.provider == "postgresql":
                connection.execute(
                    "ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS phase TEXT NOT NULL DEFAULT 'not_started'"
                )
            else:
                connection.execute(
                    "ALTER TABLE class_sessions ADD COLUMN phase TEXT NOT NULL DEFAULT 'not_started'"
                )
    except Exception:
        # Column already exists (SQLite) or other migration issue — safe to ignore
        pass

def _migrate_remove_legacy_material_columns() -> None:
    """Remove file-era material columns after the move to step attachments."""
    legacy_columns = ("file_type", "file_url", "file_size", "is_deleted")

    with get_connection() as connection:
        if connection.provider == "postgresql":
            table_exists = connection.execute(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = 'materials'
                ) AS exists
                """
            ).fetchone()["exists"]
            if not table_exists:
                return
            for column in legacy_columns:
                connection.execute(f"ALTER TABLE materials DROP COLUMN IF EXISTS {column}")
            return

        existing_columns = {
            row["name"] for row in connection.execute("PRAGMA table_info(materials)").fetchall()
        }
        for column in legacy_columns:
            if column in existing_columns:
                connection.execute(f"ALTER TABLE materials DROP COLUMN {column}")

def _migrate_add_material_updated_at_column() -> None:
    """Add updated_at column to legacy materials table and backfill it."""
    try:
        with get_connection() as connection:
            if connection.provider == "postgresql":
                connection.execute(
                    "ALTER TABLE materials ADD COLUMN IF NOT EXISTS updated_at TEXT"
                )
            else:
                connection.execute(
                    "ALTER TABLE materials ADD COLUMN updated_at TEXT"
                )
            connection.execute(
                "UPDATE materials SET updated_at = created_at WHERE updated_at IS NULL"
            )
    except Exception:
        pass

def _migrate_add_phase_tag_column() -> None:
    try:
        with get_connection() as connection:
            if connection.provider == "postgresql":
                connection.execute(
                    "ALTER TABLE session_material_assignments ADD COLUMN IF NOT EXISTS phase_tag TEXT NOT NULL DEFAULT 'both'"
                )
            else:
                connection.execute(
                    "ALTER TABLE session_material_assignments ADD COLUMN phase_tag TEXT NOT NULL DEFAULT 'both'"
                )
    except Exception:
        pass

def _migrate_add_sort_order_column() -> None:
    try:
        with get_connection() as connection:
            if connection.provider == "postgresql":
                connection.execute(
                    "ALTER TABLE session_material_assignments ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0"
                )
            else:
                connection.execute(
                    "ALTER TABLE session_material_assignments ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0"
                )
    except Exception:
        pass

try:
    _migrate_add_phase_column()
except Exception:
    pass

_migrate_remove_legacy_material_columns()

try:
    _migrate_add_material_updated_at_column()
except Exception:
    pass

try:
    _migrate_add_phase_tag_column()
except Exception:
    pass

try:
    _migrate_add_sort_order_column()
except Exception:
    pass

def _migrate_sync_session_datetimes_to_class_schedule() -> None:
    """Rebuild stored session datetimes from session_date plus class wall-clock times."""
    try:
        with get_connection() as connection:
            rows = connection.execute(
                """
                SELECT s.id, s.session_date, g.start_time, g.end_time
                FROM class_sessions s
                JOIN class_groups g ON g.id = s.class_group_id
                """
            ).fetchall()
            for row in rows:
                expected_start = combine_session_datetime(parse_date_value(row["session_date"]), row["start_time"]).isoformat()
                expected_end = combine_session_datetime(parse_date_value(row["session_date"]), row["end_time"]).isoformat()
                connection.execute(
                    "UPDATE class_sessions SET start_datetime = ?, end_datetime = ? WHERE id = ?",
                    (expected_start, expected_end, row["id"]),
                )
    except Exception:
        pass

try:
    _migrate_sync_session_datetimes_to_class_schedule()
except Exception:
    pass
