import sqlite3
from datetime import date, datetime, time, timedelta, timezone
from secrets import token_urlsafe
from typing import Any, Literal, Optional
from uuid import uuid4

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .config import Settings, get_settings

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:  # pragma: no cover - exercised only when the optional driver is missing.
    psycopg = None
    dict_row = None


class User(BaseModel):
    id: str
    name: str
    email: str
    password: str
    role: Literal["Teacher", "Student"]


class StudentProfile(BaseModel):
    id: str
    user_id: str
    display_name: str
    parent_name: str = ""
    notes: str = ""
    created_at: datetime


class ClassGroup(BaseModel):
    id: str
    name: str
    description: str = ""
    weekday: int = Field(ge=0, le=6)
    start_time: str
    end_time: str
    status: Literal["active", "archived"] = "active"
    created_at: datetime


class ClassMembership(BaseModel):
    id: str
    class_group_id: str
    student_id: str
    status: Literal["active", "inactive"] = "active"
    joined_at: datetime


class ClassSession(BaseModel):
    id: str
    class_group_id: str
    session_date: date
    start_datetime: datetime
    end_datetime: datetime
    status: Literal["scheduled", "cancelled", "completed"] = "scheduled"
    title: str = ""
    created_at: datetime


class Material(BaseModel):
    id: str
    title: str
    description: str = ""
    file_type: Literal["pdf", "ppt", "image", "video", "other"]
    file_url: str
    file_size: int = 0
    uploaded_by: str
    created_at: datetime


class SessionMaterialAssignment(BaseModel):
    id: str
    class_session_id: str
    material_id: str
    assigned_to_type: Literal["class", "student"]
    assigned_to_student_id: Optional[str] = None
    assigned_by: str
    created_at: datetime


class LoginRequest(BaseModel):
    email: str
    password: str


class StudentCreateRequest(BaseModel):
    display_name: str
    email: str
    parent_name: str = ""


class ClassCreateRequest(BaseModel):
    name: str
    description: str = ""
    weekday: int = Field(ge=0, le=6)
    start_time: str
    end_time: str


class MembershipCreateRequest(BaseModel):
    student_id: str


class GenerateSessionsRequest(BaseModel):
    term_start_date: date
    session_count: int = Field(ge=1, le=30)


class MaterialCreateRequest(BaseModel):
    title: str
    description: str = ""
    file_type: Literal["pdf", "ppt", "image", "video", "other"]
    file_url: str
    file_size: int = Field(default=0, ge=0)


class AssignmentCreateRequest(BaseModel):
    material_id: str
    assigned_to_type: Literal["class", "student"] = "class"
    assigned_to_student_id: Optional[str] = None


class SessionDeleteResponse(BaseModel):
    deleted_session_id: str


class PublicUser(BaseModel):
    id: str
    name: str
    email: str
    role: Literal["Teacher", "Student"]


class SessionRecord(BaseModel):
    user_id: str
    expires_at: datetime


settings = get_settings()
app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:3000", "http://localhost:3000", "http://127.0.0.1:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

sessions: dict[str, SessionRecord] = {}

WEEKDAY_LABELS = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
]


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def make_id(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex[:10]}"


def ensure_database_parent() -> None:
    settings.sqlite_file.parent.mkdir(parents=True, exist_ok=True)


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
                created_at TEXT NOT NULL,
                UNIQUE(class_group_id, session_date)
            );

            CREATE TABLE IF NOT EXISTS materials (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                file_type TEXT NOT NULL,
                file_url TEXT NOT NULL,
                file_size INTEGER NOT NULL DEFAULT 0,
                uploaded_by TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS session_material_assignments (
                id TEXT PRIMARY KEY,
                class_session_id TEXT NOT NULL,
                material_id TEXT NOT NULL,
                assigned_to_type TEXT NOT NULL,
                assigned_to_student_id TEXT,
                assigned_by TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
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


def parse_time_value(raw: str) -> time:
    try:
        hour, minute = raw.split(":", 1)
        return time(hour=int(hour), minute=int(minute))
    except Exception as exc:
        raise HTTPException(status_code=422, detail="Time must use HH:MM format.") from exc


def combine_session_datetime(session_date: date, raw_time: str) -> datetime:
    session_time = parse_time_value(raw_time)
    return datetime.combine(session_date, session_time, tzinfo=timezone.utc)


def first_weekday_on_or_after(start_date: date, weekday: int) -> date:
    delta = (weekday - start_date.weekday()) % 7
    return start_date + timedelta(days=delta)


def parse_datetime_value(raw: str) -> datetime:
    if isinstance(raw, datetime):
        return raw
    return datetime.fromisoformat(raw)


def parse_date_value(raw: str) -> date:
    if isinstance(raw, date):
        return raw
    return date.fromisoformat(raw)


def to_public_user(user: User) -> PublicUser:
    return PublicUser(id=user.id, name=user.name, email=user.email, role=user.role)


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
        created_at=parse_datetime_value(row["created_at"]),
    )


def row_to_material(row: sqlite3.Row) -> Material:
    return Material(
        id=row["id"],
        title=row["title"],
        description=row["description"],
        file_type=row["file_type"],
        file_url=row["file_url"],
        file_size=row["file_size"],
        uploaded_by=row["uploaded_by"],
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
            SELECT id, class_group_id, session_date, start_datetime, end_datetime, status, title, created_at
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
            SELECT id, title, description, file_type, file_url, file_size, uploaded_by, created_at
            FROM materials
            WHERE id = ?
            """,
            (material_id,),
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Material not found.")
    return row_to_material(row)


def get_current_user(authorization: str = Header(default="")) -> User:
    token = authorization.removeprefix("Bearer ").strip()
    session = sessions.get(token)
    if not token or session is None or session.expires_at < now_utc():
        sessions.pop(token, None)
        raise HTTPException(status_code=401, detail="Not authenticated.")

    with get_connection() as connection:
        row = connection.execute(
            "SELECT id, name, email, password, role FROM users WHERE id = ?",
            (session.user_id,),
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=401, detail="Not authenticated.")
    return row_to_user(row)


def require_teacher(user: User = Depends(get_current_user)) -> User:
    if user.role != "Teacher":
        raise HTTPException(status_code=403, detail="Teacher role required.")
    return user


def require_student(user: User = Depends(get_current_user)) -> User:
    if user.role != "Student":
        raise HTTPException(status_code=403, detail="Student role required.")
    return user


def build_teacher_dashboard_payload(user: User) -> dict:
    with get_connection() as connection:
        user_rows = connection.execute("SELECT id, name, email, password, role FROM users ORDER BY name").fetchall()
        student_rows = connection.execute(
            """
            SELECT id, user_id, display_name, parent_name, notes, created_at
            FROM student_profiles
            ORDER BY created_at
            """
        ).fetchall()
        class_rows = connection.execute(
            """
            SELECT id, name, description, weekday, start_time, end_time, status, created_at
            FROM class_groups
            ORDER BY created_at
            """
        ).fetchall()
        membership_rows = connection.execute(
            """
            SELECT id, class_group_id, student_id, status, joined_at
            FROM class_memberships
            ORDER BY joined_at
            """
        ).fetchall()
        session_rows = connection.execute(
            """
            SELECT id, class_group_id, session_date, start_datetime, end_datetime, status, title, created_at
            FROM class_sessions
            ORDER BY session_date, start_datetime
            """
        ).fetchall()
        material_rows = connection.execute(
            """
            SELECT id, title, description, file_type, file_url, file_size, uploaded_by, created_at
            FROM materials
            ORDER BY created_at DESC
            """
        ).fetchall()
        assignment_rows = connection.execute(
            """
            SELECT id, class_session_id, material_id, assigned_to_type, assigned_to_student_id, assigned_by, created_at
            FROM session_material_assignments
            ORDER BY created_at DESC
            """
        ).fetchall()

    users = [row_to_user(row) for row in user_rows]
    student_profiles = [row_to_student_profile(row) for row in student_rows]
    class_groups = [row_to_class_group(row) for row in class_rows]
    class_memberships = [row_to_class_membership(row) for row in membership_rows]
    class_sessions = [row_to_class_session(row) for row in session_rows]
    materials = [row_to_material(row) for row in material_rows]
    assignments = [row_to_assignment(row) for row in assignment_rows]

    class_lookup = {group.id: group for group in class_groups}
    user_lookup = {user_item.id: user_item for user_item in users}
    student_lookup = {profile.id: profile for profile in student_profiles}
    material_lookup = {material.id: material for material in materials}
    memberships_by_student: dict[str, list[ClassMembership]] = {}
    memberships_by_class: dict[str, list[ClassMembership]] = {}
    assignments_by_session: dict[str, list[SessionMaterialAssignment]] = {}

    for membership in class_memberships:
        memberships_by_student.setdefault(membership.student_id, []).append(membership)
        memberships_by_class.setdefault(membership.class_group_id, []).append(membership)

    for assignment in assignments:
        assignments_by_session.setdefault(assignment.class_session_id, []).append(assignment)

    students_payload = []
    for profile in student_profiles:
        linked_user = user_lookup.get(profile.user_id)
        student_classes = [
            class_lookup[membership.class_group_id].name
            for membership in memberships_by_student.get(profile.id, [])
            if membership.class_group_id in class_lookup and membership.status == "active"
        ]
        students_payload.append(
            {
                "id": profile.id,
                "displayName": profile.display_name,
                "email": linked_user.email if linked_user else "",
                "parentName": profile.parent_name,
                "classNames": student_classes,
                "createdAt": profile.created_at.isoformat(),
            }
        )

    classes_payload = []
    for group in class_groups:
        active_memberships = [
            membership for membership in memberships_by_class.get(group.id, []) if membership.status == "active"
        ]
        member_names = [
            student_lookup[membership.student_id].display_name
            for membership in active_memberships
            if membership.student_id in student_lookup
        ]
        session_count = sum(1 for session in class_sessions if session.class_group_id == group.id)
        classes_payload.append(
            {
                "id": group.id,
                "name": group.name,
                "description": group.description,
                "weekday": group.weekday,
                "weekdayLabel": WEEKDAY_LABELS[group.weekday],
                "startTime": group.start_time,
                "endTime": group.end_time,
                "memberCount": len(active_memberships),
                "memberNames": member_names,
                "sessionCount": session_count,
                "status": group.status,
            }
        )

    sessions_payload = []
    for session in class_sessions:
        group = class_lookup.get(session.class_group_id)
        session_assignments = assignments_by_session.get(session.id, [])
        sessions_payload.append(
            {
                "id": session.id,
                "classGroupId": session.class_group_id,
                "className": group.name if group else "Unknown class",
                "sessionDate": session.session_date.isoformat(),
                "startTime": session.start_datetime.strftime("%H:%M"),
                "endTime": session.end_datetime.strftime("%H:%M"),
                "status": session.status,
                "title": session.title,
                "assignmentCount": len(session_assignments),
                "assignments": [
                    {
                        "id": assignment.id,
                        "materialId": assignment.material_id,
                        "materialTitle": material_lookup[assignment.material_id].title
                        if assignment.material_id in material_lookup
                        else "Unknown material",
                        "assignedToType": assignment.assigned_to_type,
                        "assignedToStudentId": assignment.assigned_to_student_id,
                        "assignedToStudentName": student_lookup[assignment.assigned_to_student_id].display_name
                        if assignment.assigned_to_student_id in student_lookup
                        else "",
                    }
                    for assignment in session_assignments
                ],
            }
        )

    materials_payload = [
        {
            "id": material.id,
            "title": material.title,
            "description": material.description,
            "fileType": material.file_type,
            "fileUrl": material.file_url,
            "fileSize": material.file_size,
            "createdAt": material.created_at.isoformat(),
        }
        for material in materials
    ]

    assignments_payload = [
        {
            "id": assignment.id,
            "classSessionId": assignment.class_session_id,
            "materialId": assignment.material_id,
            "materialTitle": material_lookup[assignment.material_id].title
            if assignment.material_id in material_lookup
            else "Unknown material",
            "assignedToType": assignment.assigned_to_type,
            "assignedToStudentId": assignment.assigned_to_student_id,
            "assignedToStudentName": student_lookup[assignment.assigned_to_student_id].display_name
            if assignment.assigned_to_student_id in student_lookup
            else "",
            "createdAt": assignment.created_at.isoformat(),
        }
        for assignment in assignments
    ]

    return {
        "title": "Teacher Dashboard",
        "welcome": f"Welcome, {user.name}.",
        "next": ["Students", "Classes", "Sessions", "Material Library", "Attendance"],
        "summary": {
            "studentCount": len(student_profiles),
            "classCount": len(class_groups),
            "sessionCount": len(class_sessions),
            "materialCount": len(materials),
            "assignmentCount": len(assignments),
        },
        "students": students_payload,
        "classes": classes_payload,
        "sessions": sessions_payload,
        "materials": materials_payload,
        "assignments": assignments_payload,
    }


def scoped_placeholders(values: list[str]) -> str:
    return ", ".join("?" for _ in values)


def material_for_student_payload(
    material: Material,
    session: ClassSession,
    class_name: str,
    assignment: SessionMaterialAssignment,
) -> dict:
    return {
        "id": material.id,
        "title": material.title,
        "description": material.description,
        "fileType": material.file_type,
        "fileUrl": material.file_url,
        "classSessionId": session.id,
        "className": class_name,
        "sessionDate": session.session_date.isoformat(),
        "startTime": session.start_datetime.strftime("%H:%M"),
        "endTime": session.end_datetime.strftime("%H:%M"),
        "assignmentScope": assignment.assigned_to_type,
    }


def build_student_learning_payload(user: User) -> dict:
    profile = get_student_profile_for_user(user.id)
    current_time = now_utc()

    with get_connection() as connection:
        membership_rows = connection.execute(
            """
            SELECT id, class_group_id, student_id, status, joined_at
            FROM class_memberships
            WHERE student_id = ? AND status = 'active'
            ORDER BY joined_at
            """,
            (profile.id,),
        ).fetchall()

        class_ids = [row["class_group_id"] for row in membership_rows]
        if not class_ids:
            return {
                "title": "Current Lesson",
                "welcome": f"Welcome, {profile.display_name}.",
                "studentName": profile.display_name,
                "status": "You are not assigned to a class yet.",
                "currentSession": None,
                "currentMaterials": [],
                "reviewMaterials": [],
            }

        class_placeholders = scoped_placeholders(class_ids)
        session_rows = connection.execute(
            f"""
            SELECT
                s.id,
                s.class_group_id,
                s.session_date,
                s.start_datetime,
                s.end_datetime,
                s.status,
                s.title,
                s.created_at,
                g.name AS class_name
            FROM class_sessions s
            JOIN class_groups g ON g.id = s.class_group_id
            WHERE s.class_group_id IN ({class_placeholders}) AND s.status = 'scheduled'
            ORDER BY s.start_datetime DESC
            """,
            tuple(class_ids),
        ).fetchall()

        session_ids = [row["id"] for row in session_rows]
        if not session_ids:
            return {
                "title": "Current Lesson",
                "welcome": f"Welcome, {profile.display_name}.",
                "studentName": profile.display_name,
                "status": "No class session has been scheduled yet.",
                "currentSession": None,
                "currentMaterials": [],
                "reviewMaterials": [],
            }

        session_placeholders = scoped_placeholders(session_ids)
        assignment_rows = connection.execute(
            f"""
            SELECT id, class_session_id, material_id, assigned_to_type, assigned_to_student_id, assigned_by, created_at
            FROM session_material_assignments
            WHERE class_session_id IN ({session_placeholders})
              AND (
                assigned_to_type = 'class'
                OR (assigned_to_type = 'student' AND assigned_to_student_id = ?)
              )
            ORDER BY created_at
            """,
            (*session_ids, profile.id),
        ).fetchall()

        material_ids = sorted({row["material_id"] for row in assignment_rows})
        material_rows = []
        if material_ids:
            material_placeholders = scoped_placeholders(material_ids)
            material_rows = connection.execute(
                f"""
                SELECT id, title, description, file_type, file_url, file_size, uploaded_by, created_at
                FROM materials
                WHERE id IN ({material_placeholders})
                """,
                tuple(material_ids),
            ).fetchall()

    sessions_with_classes = [
        (row_to_class_session(row), row["class_name"])
        for row in session_rows
    ]
    assignments = [row_to_assignment(row) for row in assignment_rows]
    materials = {row["id"]: row_to_material(row) for row in material_rows}
    assignments_by_session: dict[str, list[SessionMaterialAssignment]] = {}
    for assignment in assignments:
        assignments_by_session.setdefault(assignment.class_session_id, []).append(assignment)

    current_session_data = None
    current_materials = []
    review_materials = []

    for session, class_name in sessions_with_classes:
        session_assignments = assignments_by_session.get(session.id, [])
        personal_assignments = [
            assignment for assignment in session_assignments if assignment.assigned_to_student_id == profile.id
        ]
        resolved_assignments = personal_assignments or [
            assignment for assignment in session_assignments if assignment.assigned_to_type == "class"
        ]
        session_materials = [
            material_for_student_payload(materials[assignment.material_id], session, class_name, assignment)
            for assignment in resolved_assignments
            if assignment.material_id in materials
        ]

        if session.start_datetime <= current_time <= session.end_datetime and current_session_data is None:
            current_session_data = {
                "id": session.id,
                "className": class_name,
                "sessionDate": session.session_date.isoformat(),
                "startTime": session.start_datetime.strftime("%H:%M"),
                "endTime": session.end_datetime.strftime("%H:%M"),
                "title": session.title,
            }
            current_materials = session_materials
        elif session.end_datetime < current_time:
            review_materials.extend(session_materials)

    status = "No class is currently in session."
    if current_session_data and not current_materials:
        status = "The teacher is preparing the lesson material."
    elif current_session_data and current_materials:
        status = "Current lesson material is ready."

    return {
        "title": "Current Lesson",
        "welcome": f"Welcome, {profile.display_name}.",
        "studentName": profile.display_name,
        "status": status,
        "currentSession": current_session_data,
        "currentMaterials": current_materials,
        "reviewMaterials": review_materials,
    }


@app.get("/api/health")
def health(settings: Settings = Depends(get_settings)):
    return {
        "app": settings.app_name,
        "environment": settings.environment,
        "backend": "FastAPI",
        "databaseProvider": settings.database_provider,
        "databaseName": settings.db_name,
        "databasePasswordConfigured": settings.is_database_password_configured,
        "databaseUrl": settings.database_url,
    }


@app.get("/api/config/database")
def database_config(settings: Settings = Depends(get_settings), _: User = Depends(require_teacher)):
    return {
        "provider": settings.database_provider,
        "database": settings.db_name,
        "sqlitePath": str(settings.sqlite_file),
        "host": settings.db_host,
        "port": settings.db_port,
        "user": settings.db_user,
        "driver": settings.sqlserver_driver,
        "passwordConfigured": settings.is_database_password_configured,
    }


@app.post("/api/auth/login")
def login(request: LoginRequest):
    user = find_user_by_email(request.email)
    if user is None or user.password != request.password:
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    token = token_urlsafe(32)
    sessions[token] = SessionRecord(user_id=user.id, expires_at=now_utc() + timedelta(hours=8))
    return {"token": token, "user": to_public_user(user)}


@app.get("/api/me")
def me(user: User = Depends(get_current_user)):
    return {"user": to_public_user(user)}


@app.get("/api/teacher/dashboard")
def teacher_dashboard(user: User = Depends(require_teacher)):
    return build_teacher_dashboard_payload(user)


@app.get("/api/teacher/students")
def teacher_students(user: User = Depends(require_teacher)):
    return {"students": build_teacher_dashboard_payload(user)["students"]}


@app.post("/api/teacher/students")
def create_student(request: StudentCreateRequest, user: User = Depends(require_teacher)):
    if find_user_by_email(request.email) is not None:
        raise HTTPException(status_code=409, detail="A user with this email already exists.")

    normalized_name = request.display_name.strip()
    if not normalized_name:
        raise HTTPException(status_code=422, detail="Student name is required.")

    user_id = make_id("user")
    student_user = User(
        id=user_id,
        name=normalized_name,
        email=request.email.strip(),
        password="ChangeMe123!",
        role="Student",
    )
    profile = StudentProfile(
        id=make_id("student"),
        user_id=user_id,
        display_name=normalized_name,
        parent_name=request.parent_name.strip(),
        notes="",
        created_at=now_utc(),
    )
    with get_connection() as connection:
        connection.execute(
            "INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)",
            (student_user.id, student_user.name, student_user.email, student_user.password, student_user.role),
        )
        connection.execute(
            """
            INSERT INTO student_profiles (id, user_id, display_name, parent_name, notes, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                profile.id,
                profile.user_id,
                profile.display_name,
                profile.parent_name,
                profile.notes,
                profile.created_at.isoformat(),
            ),
        )
    return {"student": build_teacher_dashboard_payload(user)["students"][-1]}


@app.get("/api/teacher/classes")
def teacher_classes(user: User = Depends(require_teacher)):
    return {"classes": build_teacher_dashboard_payload(user)["classes"]}


@app.post("/api/teacher/classes")
def create_class(request: ClassCreateRequest, user: User = Depends(require_teacher)):
    normalized_name = request.name.strip()
    if not normalized_name:
        raise HTTPException(status_code=422, detail="Class name is required.")

    parse_time_value(request.start_time)
    parse_time_value(request.end_time)
    class_group = ClassGroup(
        id=make_id("class"),
        name=normalized_name,
        description=request.description.strip(),
        weekday=request.weekday,
        start_time=request.start_time,
        end_time=request.end_time,
        created_at=now_utc(),
    )
    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO class_groups (id, name, description, weekday, start_time, end_time, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                class_group.id,
                class_group.name,
                class_group.description,
                class_group.weekday,
                class_group.start_time,
                class_group.end_time,
                class_group.status,
                class_group.created_at.isoformat(),
            ),
        )
    return {"class": build_teacher_dashboard_payload(user)["classes"][-1]}


@app.post("/api/teacher/classes/{class_id}/memberships")
def add_student_to_class(class_id: str, request: MembershipCreateRequest, user: User = Depends(require_teacher)):
    get_class_group(class_id)
    get_student_profile(request.student_id)

    with get_connection() as connection:
        duplicate = connection.execute(
            """
            SELECT id
            FROM class_memberships
            WHERE class_group_id = ? AND student_id = ? AND status = 'active'
            """,
            (class_id, request.student_id),
        ).fetchone()
        if duplicate is not None:
            raise HTTPException(status_code=409, detail="Student is already in this class.")

        membership = ClassMembership(
            id=make_id("membership"),
            class_group_id=class_id,
            student_id=request.student_id,
            joined_at=now_utc(),
        )
        connection.execute(
            """
            INSERT INTO class_memberships (id, class_group_id, student_id, status, joined_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                membership.id,
                membership.class_group_id,
                membership.student_id,
                membership.status,
                membership.joined_at.isoformat(),
            ),
        )
    return {"ok": True}


@app.post("/api/teacher/classes/{class_id}/generate-sessions")
def generate_sessions(class_id: str, request: GenerateSessionsRequest, user: User = Depends(require_teacher)):
    class_group = get_class_group(class_id)
    first_date = first_weekday_on_or_after(request.term_start_date, class_group.weekday)

    generated = []
    with get_connection() as connection:
        existing_dates = {
            row["session_date"]
            for row in connection.execute(
                "SELECT session_date FROM class_sessions WHERE class_group_id = ?",
                (class_group.id,),
            ).fetchall()
        }

        for index in range(request.session_count):
            session_date = first_date + timedelta(days=index * 7)
            if session_date.isoformat() in existing_dates:
                continue

            session = ClassSession(
                id=make_id("session"),
                class_group_id=class_group.id,
                session_date=session_date,
                start_datetime=combine_session_datetime(session_date, class_group.start_time),
                end_datetime=combine_session_datetime(session_date, class_group.end_time),
                title=f"{class_group.name} Session {index + 1}",
                created_at=now_utc(),
            )
            connection.execute(
                """
                INSERT INTO class_sessions (
                    id, class_group_id, session_date, start_datetime, end_datetime, status, title, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    session.id,
                    session.class_group_id,
                    session.session_date.isoformat(),
                    session.start_datetime.isoformat(),
                    session.end_datetime.isoformat(),
                    session.status,
                    session.title,
                    session.created_at.isoformat(),
                ),
            )
            generated.append(session.id)
    return {"generatedSessionIds": generated, "generatedCount": len(generated)}


@app.delete("/api/teacher/sessions/{session_id}", response_model=SessionDeleteResponse)
def delete_session(session_id: str, _: User = Depends(require_teacher)):
    with get_connection() as connection:
        row = connection.execute(
            "SELECT id FROM class_sessions WHERE id = ?",
            (session_id,),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Session not found.")
        connection.execute("DELETE FROM class_sessions WHERE id = ?", (session_id,))
    return SessionDeleteResponse(deleted_session_id=session_id)


@app.get("/api/teacher/materials")
def teacher_materials(user: User = Depends(require_teacher)):
    return {"materials": build_teacher_dashboard_payload(user)["materials"]}


@app.post("/api/teacher/materials")
def create_material(request: MaterialCreateRequest, user: User = Depends(require_teacher)):
    normalized_title = request.title.strip()
    normalized_url = request.file_url.strip()
    if not normalized_title:
        raise HTTPException(status_code=422, detail="Material title is required.")
    if not normalized_url:
        raise HTTPException(status_code=422, detail="Material URL or path is required.")

    material = Material(
        id=make_id("material"),
        title=normalized_title,
        description=request.description.strip(),
        file_type=request.file_type,
        file_url=normalized_url,
        file_size=request.file_size,
        uploaded_by=user.id,
        created_at=now_utc(),
    )
    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO materials (id, title, description, file_type, file_url, file_size, uploaded_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                material.id,
                material.title,
                material.description,
                material.file_type,
                material.file_url,
                material.file_size,
                material.uploaded_by,
                material.created_at.isoformat(),
            ),
        )
    return {"material": material}


@app.post("/api/teacher/sessions/{session_id}/assign-material")
def assign_material_to_session(
    session_id: str,
    request: AssignmentCreateRequest,
    user: User = Depends(require_teacher),
):
    class_session = get_class_session(session_id)
    get_material(request.material_id)

    assigned_to_student_id = request.assigned_to_student_id
    if request.assigned_to_type == "student":
        if not assigned_to_student_id:
            raise HTTPException(status_code=422, detail="Student assignment requires a student.")
        get_student_profile(assigned_to_student_id)
        with get_connection() as connection:
            membership = connection.execute(
                """
                SELECT id
                FROM class_memberships
                WHERE class_group_id = ? AND student_id = ? AND status = 'active'
                """,
                (class_session.class_group_id, assigned_to_student_id),
            ).fetchone()
        if membership is None:
            raise HTTPException(status_code=422, detail="Student must be an active member of this session's class.")
    else:
        assigned_to_student_id = None

    assignment = SessionMaterialAssignment(
        id=make_id("assignment"),
        class_session_id=session_id,
        material_id=request.material_id,
        assigned_to_type=request.assigned_to_type,
        assigned_to_student_id=assigned_to_student_id,
        assigned_by=user.id,
        created_at=now_utc(),
    )
    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO session_material_assignments (
                id, class_session_id, material_id, assigned_to_type, assigned_to_student_id, assigned_by, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                assignment.id,
                assignment.class_session_id,
                assignment.material_id,
                assignment.assigned_to_type,
                assignment.assigned_to_student_id,
                assignment.assigned_by,
                assignment.created_at.isoformat(),
            ),
        )
    return {"assignment": assignment}


@app.get("/api/student/current-lesson")
def student_current_lesson(user: User = Depends(require_student)):
    return build_student_learning_payload(user)


@app.get("/api/student/review-materials")
def student_review_materials(user: User = Depends(require_student)):
    return {"materials": build_student_learning_payload(user)["reviewMaterials"]}


app.mount("/static", StaticFiles(directory="public"), name="static")


@app.get("/{path:path}")
def spa(path: str):
    return FileResponse("public/index.html")


init_database()
