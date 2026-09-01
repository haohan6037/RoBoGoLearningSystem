"""RoBoGo Learning Portal — FastAPI application endpoints."""
import html
import base64
import mimetypes
import re
import shutil
import subprocess
from datetime import date, datetime, time, timedelta, timezone
from math import asin, cos, radians, sin, sqrt
from pathlib import Path
from secrets import token_urlsafe
from typing import Literal, Optional

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles

from .config import Settings, get_settings
from .models import (
    MATERIAL_DIRECTORY_MAP, MATERIAL_ALLOWED_EXTENSIONS, MATERIAL_DEFAULT_EXTENSIONS,
    ENGINEERING_NOTEBOOK_SEASON_SPECS,
    User, StudentProfile, ClassGroup, ClassMembership, ClassSession,
    Material, MaterialStep, SessionMaterialAssignment, MaterialViewRecord, AttendanceRecord,
    LoginRequest, StudentCreateRequest, ClassCreateRequest,
    MembershipCreateRequest, GenerateSessionsRequest,
    AssignmentCreateRequest, MaterialUpdateRequest, SessionUpdateRequest,
    PasswordChangeRequest, MaterialOpenRequest, SessionDeleteResponse,
    MaterialStepCreateRequest, MaterialStepUpdateRequest, MaterialStepReorderRequest,
    EngineeringTeamCreateRequest, EngineeringTeamUpdateRequest, EngineeringTeamMemberRequest, EngineeringNoteWriteRequest,
    EngineeringMergeProposalCreateRequest,
    PublicUser, SessionRecord,
)
from .utils import (
    now_utc, make_id, WEEKDAY_LABELS,
    parse_time_value, parse_date_value, parse_datetime_value, first_weekday_on_or_after,
    combine_session_datetime, is_session_active, resolve_location_status,
)
from .database import (
    get_connection, init_database,
    find_user_by_email, get_student_profile, get_student_profile_for_user,
    get_class_group, get_class_session, get_material, get_material_steps, get_material_step,
    row_to_user, row_to_student_profile, row_to_class_group,
    row_to_class_membership, row_to_class_session, row_to_material,
    row_to_assignment, row_to_material_view_record, row_to_attendance_record,
)

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

def extract_bearer_token(authorization: str = "", access_token: Optional[str] = None) -> str:
    header_token = authorization.removeprefix("Bearer ").strip()
    return header_token or (access_token or "").strip()


def lookup_user_by_session_token(token: str) -> User:
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


def get_current_user(authorization: str = Header(default="")) -> User:
    return lookup_user_by_session_token(extract_bearer_token(authorization))


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
            SELECT id, class_group_id, session_date, start_datetime, end_datetime, status, title, phase, created_at
            FROM class_sessions
            ORDER BY session_date, start_datetime
            """
        ).fetchall()
        material_rows = connection.execute(
            """
            SELECT id, title, description, uploaded_by, created_at, updated_at
            FROM materials
            ORDER BY created_at DESC
            """
        ).fetchall()
        assignment_rows = connection.execute(
            """
            SELECT id, class_session_id, material_id, assigned_to_type, assigned_to_student_id, assigned_by, phase_tag, sort_order, created_at
            FROM session_material_assignments
            ORDER BY sort_order ASC, created_at ASC
            """
        ).fetchall()
        attendance_rows = connection.execute(
            """
            SELECT id, student_id, class_session_id, material_id, checked_in_at, method, location_status, latitude, longitude, created_at
            FROM attendance_records
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
    attendance_records = [row_to_attendance_record(row) for row in attendance_rows]

    class_lookup = {group.id: group for group in class_groups}
    user_lookup = {user_item.id: user_item for user_item in users}
    student_lookup = {profile.id: profile for profile in student_profiles}
    material_lookup = {material.id: material for material in materials}
    memberships_by_student: dict[str, list[ClassMembership]] = {}
    memberships_by_class: dict[str, list[ClassMembership]] = {}
    assignments_by_session: dict[str, list[SessionMaterialAssignment]] = {}
    attendance_by_session: dict[str, list[AttendanceRecord]] = {}

    for membership in class_memberships:
        memberships_by_student.setdefault(membership.student_id, []).append(membership)
        memberships_by_class.setdefault(membership.class_group_id, []).append(membership)

    for assignment in assignments:
        assignments_by_session.setdefault(assignment.class_session_id, []).append(assignment)

    for attendance_record in attendance_records:
        attendance_by_session.setdefault(attendance_record.class_session_id, []).append(attendance_record)

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
        session_attendance = attendance_by_session.get(session.id, [])
        total_members = len([m for m in memberships_by_class.get(session.class_group_id, []) if m.status == "active"])
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
                "phase": session.phase,
                "assignmentCount": len(session_assignments),
                "attendanceCount": len(session_attendance),
                "absentCount": max(total_members - len(session_attendance), 0),
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
                        "phaseTag": assignment.phase_tag,
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
            "stepCount": len(get_material_steps(material.id)),
            "createdAt": material.created_at.isoformat(),
            "updatedAt": material.updated_at.isoformat(),
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


def attachment_file_type_label(filename: Optional[str], attachment_url: Optional[str]) -> str:
    source = filename or attachment_url or ""
    match = re.search(r"\.([A-Za-z0-9]+)$", source)
    if not match:
        return "Attachment"
    return match.group(1).upper()


def is_external_attachment_url(value: Optional[str]) -> bool:
    return bool(value and re.match(r"^https?://", value, re.IGNORECASE))


def supports_generated_preview(filename: Optional[str], attachment_url: Optional[str]) -> bool:
    source = (filename or attachment_url or "").lower()
    return source.endswith(".ppt") or source.endswith(".pptx")


def step_preview_dir(step_id: str) -> Path:
    return settings.materials_storage_dir / "previews" / "steps" / step_id


def build_preview_entry_url(step_id: str) -> str:
    return f"/api/materials/steps/{step_id}/preview"


def _convert_to_pdf(file_path: Path, output_dir: Path) -> Path:
    """LibreOffice headless conversion: PPT/PPTX → PDF."""
    output_dir.mkdir(parents=True, exist_ok=True)
    pdf_path = output_dir / f"{file_path.stem}.pdf"
    target = output_dir / "source.pdf"

    if target.is_file() and target.stat().st_mtime >= file_path.stat().st_mtime:
        return target

    result = subprocess.run(
        ["soffice", "--headless", "--convert-to", "pdf", "--outdir", str(output_dir), str(file_path)],
        capture_output=True, text=True, check=False, timeout=120,
    )
    if pdf_path.is_file():
        shutil.move(str(pdf_path), str(target))
    elif result.returncode != 0 or not target.is_file():
        detail = (result.stderr or result.stdout or "PDF conversion failed.").strip()
        raise HTTPException(status_code=500, detail=detail)
    return target


def _pdf_to_images(pdf_path: Path, output_dir: Path, max_width: int = 1400, thumb_width: int = 220) -> list[dict]:
    """PyMuPDF: render PDF pages to PNG images + thumbnails.
    Returns list of {page_path, thumb_path} dicts."""
    import fitz  # PyMuPDF

    output_dir.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(str(pdf_path))
    results: list[dict] = []

    try:
        for i in range(len(doc)):
            page_path = output_dir / f"page_{i + 1:03d}.png"
            thumb_path = output_dir / f"thumb_{i + 1:03d}.png"
            cached = (page_path.is_file() and page_path.stat().st_mtime >= pdf_path.stat().st_mtime
                      and thumb_path.is_file() and thumb_path.stat().st_mtime >= pdf_path.stat().st_mtime)
            if cached:
                results.append({"page": page_path, "thumb": thumb_path})
                continue

            page = doc[i]

            # 主图
            zoom = max_width / page.rect.width
            mat = fitz.Matrix(zoom, zoom)
            pix = page.get_pixmap(matrix=mat)
            pix.save(str(page_path))

            # 缩略图
            t_zoom = thumb_width / page.rect.width
            t_mat = fitz.Matrix(t_zoom, t_zoom)
            t_pix = page.get_pixmap(matrix=t_mat)
            t_pix.save(str(thumb_path))

            results.append({"page": page_path, "thumb": thumb_path})
    finally:
        doc.close()

    return results


def ensure_preview_images(step: MaterialStep) -> list[dict]:
    """Ensure preview images exist for a step. Returns list of {page, thumb} dicts."""
    if not step.attachment_url or is_external_attachment_url(step.attachment_url):
        raise HTTPException(status_code=404, detail="Preview is only available for uploaded files.")

    file_path = settings.materials_storage_dir / step.attachment_url
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Attachment file not found.")

    preview_dir = step_preview_dir(step.id)
    preview_dir.mkdir(parents=True, exist_ok=True)
    page_marker = preview_dir / "page_001.png"
    if page_marker.is_file() and page_marker.stat().st_mtime >= file_path.stat().st_mtime:
        results = []
        for p in sorted(preview_dir.glob("page_*.png")):
            idx = p.stem.split("_")[1]
            thumb = preview_dir / f"thumb_{idx}.png"
            results.append({"page": p, "thumb": thumb})
        return results

    # Clean old previews
    for child in preview_dir.iterdir():
        if child.is_dir():
            shutil.rmtree(child)
        else:
            child.unlink()

    # Step 1: PPT/PPTX → PDF
    pdf_path = _convert_to_pdf(file_path, preview_dir)

    # Step 2: PDF → PNG images + thumbnails
    results = _pdf_to_images(pdf_path, preview_dir)

    if not results:
        raise HTTPException(status_code=500, detail="No preview pages were generated.")
    return results


def resolve_step_open_target(step: MaterialStep) -> tuple[str, bool]:
    if not step.attachment_url:
        return "", False
    if is_external_attachment_url(step.attachment_url):
        return step.attachment_url, True
    return f"/api/materials/steps/{step.id}/download", False


def material_for_student_payload(
    material: Material,
    session: ClassSession,
    class_name: str,
    assignment: SessionMaterialAssignment,
) -> dict:
    steps = get_material_steps(material.id)
    primary_step = next((step for step in steps if step.attachment_url), None)
    download_url, is_link = resolve_step_open_target(primary_step) if primary_step else ("", False)
    preview_url = (
        build_preview_entry_url(primary_step.id)
        if primary_step and supports_generated_preview(primary_step.attachment_name, primary_step.attachment_url)
        else ""
    )
    return {
        "id": material.id,
        "title": material.title,
        "description": material.description,
        "stepCount": len(steps),
        "steps": [
            {
                "id": step.id,
                "stepNumber": step.step_number,
                "stepType": step.step_type,
                "title": step.title,
                "content": step.content,
                "attachmentUrl": step.attachment_url,
                "attachmentName": step.attachment_name,
                "downloadUrl": resolve_step_open_target(step)[0] if step.attachment_url else "",
                "isLink": is_external_attachment_url(step.attachment_url),
                "previewUrl": build_preview_entry_url(step.id)
                if supports_generated_preview(step.attachment_name, step.attachment_url)
                else "",
            }
            for step in steps
        ],
        "classSessionId": session.id,
        "className": class_name,
        "sessionDate": session.session_date.isoformat(),
        "startTime": session.start_datetime.strftime("%H:%M"),
        "endTime": session.end_datetime.strftime("%H:%M"),
        "assignmentScope": assignment.assigned_to_type,
        "downloadUrl": download_url,
        "isLink": is_link,
        "previewUrl": preview_url,
        "downloadName": primary_step.attachment_name if primary_step else "",
        "fileType": attachment_file_type_label(
            primary_step.attachment_name if primary_step else None,
            primary_step.attachment_url if primary_step else None,
        ),
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
                s.phase,
                s.created_at,
                g.name AS class_name
            FROM class_sessions s
            JOIN class_groups g ON g.id = s.class_group_id
            WHERE s.class_group_id IN ({class_placeholders}) AND s.status IN ('scheduled', 'completed')
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
            SELECT id, class_session_id, material_id, assigned_to_type, assigned_to_student_id, assigned_by, phase_tag, sort_order, created_at
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
                SELECT id, title, description, uploaded_by, created_at, updated_at
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
        # Filter by current session phase
        phase_filtered = [
            a for a in resolved_assignments
            if session.phase == "not_started"
            or (session.phase == "theory" and a.phase_tag in ("both", "theory"))
            or (session.phase == "building" and a.phase_tag in ("both", "building"))
        ] or resolved_assignments
        session_materials = [
            material_for_student_payload(materials[assignment.material_id], session, class_name, assignment)
            for assignment in phase_filtered
            if assignment.material_id in materials
        ]

        if session.start_datetime <= current_time <= session.end_datetime and current_session_data is None and session.status == 'scheduled':
            current_session_data = {
                "id": session.id,
                "className": class_name,
                "sessionDate": session.session_date.isoformat(),
                "startTime": session.start_datetime.strftime("%H:%M"),
                "endTime": session.end_datetime.strftime("%H:%M"),
                "title": session.title,
                "phase": session.phase,
            }
            current_materials = session_materials
        elif session.end_datetime < current_time or session.status == 'completed':
            review_materials.extend(session_materials)

    status = "No class is currently in session."
    if current_session_data and not current_materials:
        status = "The teacher is preparing the lesson material."
    elif current_session_data and current_materials:
        status = "Current lesson material is ready."

    attendance_checked_in = False
    current_phase = "not_started"
    if current_session_data:
        with get_connection() as connection:
            attendance_row = connection.execute(
                "SELECT id FROM attendance_records WHERE student_id = ? AND class_session_id = ?",
                (profile.id, current_session_data["id"]),
            ).fetchone()
            attendance_checked_in = attendance_row is not None
        current_phase = current_session_data.get("phase", "not_started")

    return {
        "title": "Current Lesson",
        "welcome": f"Welcome, {profile.display_name}.",
        "studentName": profile.display_name,
        "status": status,
        "currentSession": current_session_data,
        "currentMaterials": current_materials,
        "reviewMaterials": review_materials,
        "classroomPhase": current_phase,
        "attendanceCheckedIn": attendance_checked_in,
    }


def find_assignment_for_student_material(
    profile: StudentProfile,
    material_id: str,
    class_session_id: Optional[str],
) -> Optional[SessionMaterialAssignment]:
    if class_session_id is None:
        return None
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT id, class_session_id, material_id, assigned_to_type, assigned_to_student_id, assigned_by, phase_tag, sort_order, created_at
            FROM session_material_assignments
            WHERE class_session_id = ?
              AND material_id = ?
              AND (
                assigned_to_type = 'class'
                OR (assigned_to_type = 'student' AND assigned_to_student_id = ?)
              )
            ORDER BY CASE WHEN assigned_to_type = 'student' THEN 0 ELSE 1 END, created_at DESC
            """,
            (class_session_id, material_id, profile.id),
        ).fetchone()
    return row_to_assignment(row) if row else None


def student_can_download_material(profile: StudentProfile, material_id: str) -> bool:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT sma.id
            FROM session_material_assignments sma
            JOIN class_sessions cs ON cs.id = sma.class_session_id
            JOIN class_memberships cm ON cm.class_group_id = cs.class_group_id
            WHERE cm.student_id = ?
              AND cm.status = 'active'
              AND sma.material_id = ?
              AND (
                sma.assigned_to_type = 'class'
                OR (sma.assigned_to_type = 'student' AND sma.assigned_to_student_id = ?)
              )
              AND cs.start_datetime <= ?
            ORDER BY cs.start_datetime DESC
            LIMIT 1
            """,
            (profile.id, material_id, profile.id, now_utc().isoformat()),
        ).fetchone()
    return row is not None


def build_session_attendance_payload(session_id: str) -> dict:
    session = get_class_session(session_id)
    class_group = get_class_group(session.class_group_id)
    with get_connection() as connection:
        membership_rows = connection.execute(
            """
            SELECT m.id, m.class_group_id, m.student_id, m.status, m.joined_at, sp.display_name
            FROM class_memberships m
            JOIN student_profiles sp ON sp.id = m.student_id
            WHERE m.class_group_id = ? AND m.status = 'active'
            ORDER BY sp.display_name
            """,
            (session.class_group_id,),
        ).fetchall()
        attendance_rows = connection.execute(
            """
            SELECT a.id, a.student_id, a.class_session_id, a.material_id, a.checked_in_at, a.method, a.location_status, a.latitude, a.longitude, a.created_at,
                   sp.display_name
            FROM attendance_records a
            JOIN student_profiles sp ON sp.id = a.student_id
            WHERE a.class_session_id = ?
            ORDER BY a.checked_in_at
            """,
            (session_id,),
        ).fetchall()

        # View records for students who attempted but failed location verification
        location_attempt_rows = connection.execute(
            """
            SELECT mvr.student_id, sp.display_name, mvr.location_status, mvr.opened_at, mvr.material_id,
                   m.title as material_title
            FROM material_view_records mvr
            JOIN student_profiles sp ON sp.id = mvr.student_id
            LEFT JOIN materials m ON m.id = mvr.material_id
            WHERE mvr.class_session_id = ?
              AND mvr.location_status IN ('outside', 'denied', 'unavailable')
            ORDER BY mvr.opened_at
            """,
            (session_id,),
        ).fetchall()
        location_attempt_ids = {row["student_id"] for row in location_attempt_rows}

        # Filter absent students to exclude those who already show in location attempts
        already_shown_ids = {row["student_id"] for row in attendance_rows} | location_attempt_ids

    return {
        "sessionId": session.id,
        "className": class_group.name,
        "sessionDate": session.session_date.isoformat(),
        "startTime": session.start_datetime.strftime("%H:%M"),
        "endTime": session.end_datetime.strftime("%H:%M"),
        "attendance": [
            {
                "studentId": row["student_id"],
                "studentName": row["display_name"],
                "checkedInAt": parse_datetime_value(row["checked_in_at"]).isoformat(),
                "locationStatus": row["location_status"],
            }
            for row in attendance_rows
        ],
        "absentStudents": [
            {
                "studentId": row["student_id"],
                "studentName": row["display_name"],
            }
            for row in membership_rows
            if row["student_id"] not in already_shown_ids
        ],
        "locationAttempts": [
            {
                "studentId": row["student_id"],
                "studentName": row["display_name"],
                "locationStatus": row["location_status"],
                "attemptedAt": parse_datetime_value(row["opened_at"]).isoformat(),
                "materialTitle": row["material_title"] or "",
            }
            for row in location_attempt_rows
        ],
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
        "attendanceLocationConfigured": settings.is_attendance_location_configured,
        "classroomLatitude": settings.classroom_latitude,
        "classroomLongitude": settings.classroom_longitude,
        "allowedRadiusMeters": settings.allowed_radius_meters,
        "attendanceGracePeriodMinutes": settings.attendance_grace_period_minutes,
    }


def to_public_user(user: User) -> PublicUser:
    return PublicUser(id=user.id, name=user.name, email=user.email, role=user.role)


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

@app.put("/api/me/password")
def change_password(request: PasswordChangeRequest, user: User = Depends(get_current_user)):
    if user.password != request.current_password:
        raise HTTPException(status_code=401, detail="Current password is incorrect.")
    new_password = request.new_password.strip()
    if len(new_password) < 6:
        raise HTTPException(status_code=422, detail="Password must be at least 6 characters.")
    if new_password == request.current_password:
        raise HTTPException(status_code=422, detail="New password must be different from current password.")

    with get_connection() as connection:
        connection.execute(
            "UPDATE users SET password = ? WHERE id = ?",
            (new_password, user.id),
        )
    return {"message": "Password updated successfully."}


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
        password=request.password.strip() or token_urlsafe(6),
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
    generated_password = student_user.password
    response = {"student": build_teacher_dashboard_payload(user)["students"][-1]}
    response["generatedPassword"] = generated_password
    return response


@app.post("/api/teacher/students/{student_id}/reset-password")
def reset_student_password(student_id: str, user: User = Depends(require_teacher)):
    profile = get_student_profile(student_id)
    new_password = token_urlsafe(6)

    with get_connection() as connection:
        row = connection.execute(
            "SELECT id, password FROM users WHERE id = ?",
            (profile.user_id,),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Student user account not found.")
        connection.execute(
            "UPDATE users SET password = ? WHERE id = ?",
            (new_password, profile.user_id),
        )
    return {"studentId": student_id, "newPassword": new_password, "studentName": profile.display_name}


@app.put("/api/teacher/students/{student_id}")
def update_student(student_id: str, request: StudentCreateRequest, user: User = Depends(require_teacher)):
    profile = get_student_profile(student_id)
    normalized_name = request.display_name.strip()
    if not normalized_name:
        raise HTTPException(status_code=422, detail="Student name is required.")

    normalized_email = request.email.strip()
    if not normalized_email:
        raise HTTPException(status_code=422, detail="Email is required.")

    existing = find_user_by_email(normalized_email)
    if existing and existing.id != profile.user_id:
        raise HTTPException(status_code=409, detail="A user with this email already exists.")

    with get_connection() as connection:
        connection.execute(
            "UPDATE users SET name = ?, email = ? WHERE id = ?",
            (normalized_name, normalized_email, profile.user_id),
        )
        if request.password.strip():
            connection.execute(
                "UPDATE users SET password = ? WHERE id = ?",
                (request.password.strip(), profile.user_id),
            )
        connection.execute(
            "UPDATE student_profiles SET display_name = ?, parent_name = ? WHERE id = ?",
            (normalized_name, request.parent_name.strip(), student_id),
        )
    return {"student": get_student_profile(student_id)}


@app.put("/api/teacher/classes/{class_id}")
def update_class(class_id: str, request: ClassCreateRequest, user: User = Depends(require_teacher)):
    class_group = get_class_group(class_id)
    normalized_name = request.name.strip()
    if not normalized_name:
        raise HTTPException(status_code=422, detail="Class name is required.")

    parse_time_value(request.start_time)
    parse_time_value(request.end_time)

    with get_connection() as connection:
        connection.execute(
            "UPDATE class_groups SET name = ?, description = ?, weekday = ?, start_time = ?, end_time = ? WHERE id = ?",
            (normalized_name, request.description.strip(), request.weekday, request.start_time, request.end_time, class_id),
        )
    return {"class": get_class_group(class_id)}


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
                """
                SELECT session_date
                FROM class_sessions
                WHERE class_group_id = ?
                  AND status != 'cancelled'
                """,
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
                    id, class_group_id, session_date, start_datetime, end_datetime, status, title, phase, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    session.id,
                    session.class_group_id,
                    session.session_date.isoformat(),
                    session.start_datetime.isoformat(),
                    session.end_datetime.isoformat(),
                    session.status,
                    session.title,
                    session.phase,
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
        connection.execute("UPDATE class_sessions SET status = 'cancelled' WHERE id = ?", (session_id,))
    return {"deleted_session_id": session_id}


@app.put("/api/teacher/sessions/{session_id}")
def update_session(session_id: str, request: SessionUpdateRequest, user: User = Depends(require_teacher)):
    session = get_class_session(session_id)
    if session.status != "scheduled":
        raise HTTPException(status_code=422, detail="Only scheduled sessions can be completed or cancelled.")

    with get_connection() as connection:
        connection.execute(
            "UPDATE class_sessions SET status = ? WHERE id = ?",
            (request.status, session_id),
        )

    return {"session": get_class_session(session_id)}


@app.put("/api/teacher/sessions/{session_id}/phase")
def update_session_phase(session_id: str, phase: str = Form(...), user: User = Depends(require_teacher)):
    session = get_class_session(session_id)
    if phase not in ("not_started", "theory", "building"):
        raise HTTPException(status_code=422, detail="Invalid phase. Use: not_started, theory, building.")
    if session.status != "scheduled":
        raise HTTPException(status_code=422, detail="Only scheduled sessions can change phase.")

    with get_connection() as connection:
        connection.execute(
            "UPDATE class_sessions SET phase = ? WHERE id = ?",
            (phase, session_id),
        )
    return {"sessionId": session_id, "phase": phase}


@app.get("/api/teacher/materials")
def teacher_materials(user: User = Depends(require_teacher)):
    return {"materials": build_teacher_dashboard_payload(user)["materials"]}


@app.post("/api/teacher/materials")
def create_material(
    title: str = Form(...),
    description: str = Form(default=""),
    user: User = Depends(require_teacher),
):
    normalized_title = title.strip()
    if not normalized_title:
        raise HTTPException(status_code=422, detail="Material title is required.")

    now = now_utc()
    material_id = make_id("material")

    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO materials (id, title, description, uploaded_by, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (material_id, normalized_title, description.strip(), user.id, now.isoformat(), now.isoformat()),
        )

    return {"material": get_material(material_id)}


@app.get("/api/teacher/materials/{material_id}")
def get_material_detail(material_id: str, user: User = Depends(require_teacher)):
    material = get_material(material_id)
    steps = get_material_steps(material_id)
    return {
        "material": {
            "id": material.id,
            "title": material.title,
            "description": material.description,
            "stepCount": len(steps),
            "createdAt": material.created_at.isoformat(),
            "updatedAt": material.updated_at.isoformat(),
        },
        "steps": [
            {
                "id": step.id,
                "stepNumber": step.step_number,
                "stepType": step.step_type,
                "title": step.title,
                "content": step.content,
                "attachmentUrl": step.attachment_url,
                "attachmentName": step.attachment_name,
                "createdAt": step.created_at.isoformat(),
            }
            for step in steps
        ],
    }


@app.put("/api/teacher/materials/{material_id}")
def update_material(material_id: str, request: MaterialUpdateRequest, user: User = Depends(require_teacher)):
    material = get_material(material_id)
    normalized_title = request.title.strip()
    if not normalized_title:
        raise HTTPException(status_code=422, detail="Material title is required.")

    now = now_utc()
    with get_connection() as connection:
        connection.execute(
            "UPDATE materials SET title = ?, description = ?, updated_at = ? WHERE id = ?",
            (normalized_title, request.description.strip(), now.isoformat(), material_id),
        )
    return {"material": get_material(material_id)}


@app.delete("/api/teacher/materials/{material_id}")
def delete_material(material_id: str, user: User = Depends(require_teacher)):
    get_material(material_id)

    with get_connection() as connection:
        connection.execute("DELETE FROM material_steps WHERE material_id = ?", (material_id,))
        connection.execute("DELETE FROM session_material_assignments WHERE material_id = ?", (material_id,))
        connection.execute("DELETE FROM materials WHERE id = ?", (material_id,))

    return {"deletedMaterialId": material_id, "message": "Material and all steps deleted."}


@app.post("/api/teacher/materials/{material_id}/steps")
def create_material_step(
    material_id: str,
    request: MaterialStepCreateRequest,
    user: User = Depends(require_teacher),
):
    get_material(material_id)

    existing = get_material_steps(material_id)
    next_number = max([s.step_number for s in existing], default=0) + 1

    step_id = make_id("step")
    now = now_utc()

    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO material_steps (id, material_id, step_number, step_type, title, content,
                                        attachment_url, attachment_name, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                step_id, material_id, next_number, request.step_type, request.title.strip(),
                request.content.strip(), request.attachment_url.strip(), request.attachment_name.strip(),
                now.isoformat(),
            ),
        )

    return {"step": get_material_step(step_id)}


@app.put("/api/teacher/materials/{material_id}/steps/{step_id}")
def update_material_step(
    material_id: str,
    step_id: str,
    request: MaterialStepUpdateRequest,
    user: User = Depends(require_teacher),
):
    get_material(material_id)
    step = get_material_step(step_id)
    if step.material_id != material_id:
        raise HTTPException(status_code=404, detail="Step does not belong to this material.")

    with get_connection() as connection:
        connection.execute(
            """
            UPDATE material_steps
            SET step_type = ?, title = ?, content = ?, attachment_url = ?, attachment_name = ?
            WHERE id = ?
            """,
            (
                request.step_type, request.title.strip(), request.content.strip(),
                request.attachment_url.strip(), request.attachment_name.strip(), step_id,
            ),
        )

    return {"step": get_material_step(step_id)}


@app.delete("/api/teacher/materials/{material_id}/steps/{step_id}")
def delete_material_step(
    material_id: str,
    step_id: str,
    user: User = Depends(require_teacher),
):
    get_material(material_id)
    step = get_material_step(step_id)
    if step.material_id != material_id:
        raise HTTPException(status_code=404, detail="Step does not belong to this material.")

    with get_connection() as connection:
        connection.execute("DELETE FROM material_steps WHERE id = ?", (step_id,))

    return {"deletedStepId": step_id, "message": "Step deleted."}


@app.put("/api/teacher/materials/{material_id}/steps/reorder")
def reorder_material_steps(
    material_id: str,
    request: MaterialStepReorderRequest,
    user: User = Depends(require_teacher),
):
    get_material(material_id)

    with get_connection() as connection:
        for idx, step_id in enumerate(request.step_ids, start=1):
            connection.execute(
                "UPDATE material_steps SET step_number = ? WHERE id = ? AND material_id = ?",
                (idx, step_id, material_id),
            )

    return {"steps": [
        {"id": step.id, "stepNumber": step.step_number, "title": step.title}
        for step in get_material_steps(material_id)
    ]}


@app.post("/api/teacher/materials/{material_id}/steps/{step_id}/upload")
async def upload_step_attachment(
    material_id: str,
    step_id: str,
    file: UploadFile = File(...),
    user: User = Depends(require_teacher),
):
    get_material(material_id)
    step = get_material_step(step_id)
    if step.material_id != material_id:
        raise HTTPException(status_code=404, detail="Step does not belong to this material.")

    if not file.filename:
        raise HTTPException(status_code=422, detail="No file selected.")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=422, detail="Uploaded file is empty.")

    # 存储到 storage/materials/steps/{step_id}/{filename}
    step_dir = settings.materials_storage_dir / "steps" / step_id
    step_dir.mkdir(parents=True, exist_ok=True)

    original_name = file.filename
    safe_name = re.sub(r"[^a-zA-Z0-9._-]", "_", original_name)
    dest = step_dir / safe_name
    dest.write_bytes(content)

    relative_url = f"steps/{step_id}/{safe_name}"

    with get_connection() as connection:
        connection.execute(
            "UPDATE material_steps SET attachment_url = ?, attachment_name = ? WHERE id = ?",
            (relative_url, original_name, step_id),
        )

    return {
        "stepId": step_id,
        "attachmentUrl": relative_url,
        "attachmentName": original_name,
        "fileSize": len(content),
    }


@app.get("/api/materials/steps/{step_id}/download")
def download_step_attachment(step_id: str, user: User = Depends(get_current_user)):
    step = get_material_step(step_id)
    if not step.attachment_url:
        raise HTTPException(status_code=404, detail="No attachment for this step.")

    file_path = settings.materials_storage_dir / step.attachment_url
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Attachment file not found.")

    media_type, _ = mimetypes.guess_type(step.attachment_name or file_path.name)
    return FileResponse(
        file_path,
        filename=step.attachment_name or file_path.name,
        media_type=media_type or "application/octet-stream",
        content_disposition_type="inline",
    )


@app.get("/api/materials/steps/{step_id}/preview")
def get_step_preview_manifest(step_id: str, user: User = Depends(get_current_user)):
    step = get_material_step(step_id)
    results = ensure_preview_images(step)
    return {
        "stepId": step_id,
        "pageCount": len(results),
        "pages": [
            {
                "number": i + 1,
                "url": f"/api/materials/steps/{step_id}/preview/{i + 1}",
                "thumbnailUrl": f"/api/materials/steps/{step_id}/preview/{i + 1}/thumb",
            }
            for i in range(len(results))
        ],
    }


@app.get("/api/materials/steps/{step_id}/preview/{page:int}")
def get_step_preview_page(step_id: str, page: int, user: User = Depends(get_current_user)):
    step = get_material_step(step_id)
    results = ensure_preview_images(step)
    idx = page - 1
    if idx < 0 or idx >= len(results):
        raise HTTPException(status_code=404, detail="Page not found.")
    return FileResponse(
        results[idx]["page"],
        filename=f"page_{page:03d}.png",
        media_type="image/png",
        content_disposition_type="inline",
    )


@app.get("/api/materials/steps/{step_id}/preview/{page:int}/thumb")
def get_step_preview_thumb(step_id: str, page: int):
    step = get_material_step(step_id)
    results = ensure_preview_images(step)
    idx = page - 1
    if idx < 0 or idx >= len(results):
        raise HTTPException(status_code=404, detail="Page not found.")
    return FileResponse(
        results[idx]["thumb"],
        filename=f"thumb_{page:03d}.png",
        media_type="image/png",
        content_disposition_type="inline",
    )


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
        phase_tag=request.phase_tag,
        created_at=now_utc(),
    )
    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO session_material_assignments (
                id, class_session_id, material_id, assigned_to_type, assigned_to_student_id, assigned_by, phase_tag, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                assignment.id,
                assignment.class_session_id,
                assignment.material_id,
                assignment.assigned_to_type,
                assignment.assigned_to_student_id,
                assignment.assigned_by,
                assignment.phase_tag,
                assignment.created_at.isoformat(),
            ),
        )
    return {"assignment": assignment}


@app.get("/api/teacher/sessions/{session_id}/attendance")
def teacher_session_attendance(session_id: str, _: User = Depends(require_teacher)):
    return build_session_attendance_payload(session_id)


@app.post("/api/teacher/sessions/{session_id}/students/{student_id}/check-in")
def manual_check_in(session_id: str, student_id: str, user: User = Depends(require_teacher)):
    session = get_class_session(session_id)
    get_student_profile(student_id)
    opened_at = now_utc()

    with get_connection() as connection:
        existing = connection.execute(
            "SELECT id FROM attendance_records WHERE student_id = ? AND class_session_id = ?",
            (student_id, session_id),
        ).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="Student already checked in for this session.")

        record_id = make_id("attendance")
        connection.execute(
            """
            INSERT INTO attendance_records (id, student_id, class_session_id, material_id, checked_in_at, method, location_status, latitude, longitude, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (record_id, student_id, session_id, "", opened_at.isoformat(), "manual", "valid", None, None, opened_at.isoformat()),
        )
    return {"attendanceId": record_id, "studentId": student_id, "method": "manual"}


@app.get("/api/teacher/sessions/{session_id}/classroom")
def teacher_classroom(session_id: str, _: User = Depends(require_teacher)):
    session = get_class_session(session_id)
    class_group = get_class_group(session.class_group_id)
    attendance = build_session_attendance_payload(session_id)

    with get_connection() as connection:
        material_rows = connection.execute(
            """
            SELECT m.id, m.title, m.description, m.uploaded_by, m.created_at, m.updated_at,
                   sma.assigned_to_type, sma.assigned_to_student_id, sma.phase_tag
            FROM session_material_assignments sma
            JOIN materials m ON m.id = sma.material_id
            WHERE sma.class_session_id = ?
            ORDER BY sma.sort_order ASC, sma.created_at ASC
            """,
            (session_id,),
        ).fetchall()

        student_rows = connection.execute(
            """
            SELECT sp.id, sp.display_name
            FROM class_memberships cm
            JOIN student_profiles sp ON sp.id = cm.student_id
            WHERE cm.class_group_id = ? AND cm.status = 'active'
            ORDER BY sp.display_name
            """,
            (session.class_group_id,),
        ).fetchall()

    attendee_ids = {a["studentId"] for a in attendance["attendance"]}
    attempt_ids = {a["studentId"] for a in attendance.get("locationAttempts", [])}

    materials = []
    for row in material_rows:
        steps = get_material_steps(row["id"])
        primary_step = next((step for step in steps if step.attachment_url), None)
        download_url, is_link = resolve_step_open_target(primary_step) if primary_step else ("", False)
        materials.append({
            "id": row["id"],
            "title": row["title"],
            "description": row["description"],
            "assignedToType": row["assigned_to_type"],
            "assignedToStudentId": row["assigned_to_student_id"],
            "phaseTag": row["phase_tag"],
            "downloadUrl": download_url,
            "isLink": is_link,
            "previewUrl": build_preview_entry_url(primary_step.id)
            if primary_step and supports_generated_preview(primary_step.attachment_name, primary_step.attachment_url)
            else "",
            "fileType": attachment_file_type_label(
                primary_step.attachment_name if primary_step else None,
                primary_step.attachment_url if primary_step else None,
            ),
        })

    students_status = []
    for row in student_rows:
        sid = row["id"]
        if sid in attendee_ids:
            status = "checked_in"
        elif sid in attempt_ids:
            status = "location_failed"
        else:
            status = "absent"
        students_status.append({
            "studentId": sid,
            "studentName": row["display_name"],
            "status": status,
        })

    checked_in = len([s for s in students_status if s["status"] == "checked_in"])
    location_failed = len([s for s in students_status if s["status"] == "location_failed"])
    absent = len([s for s in students_status if s["status"] == "absent"])

    return {
        "sessionId": session.id,
        "className": class_group.name,
        "sessionDate": session.session_date.isoformat(),
        "startTime": session.start_datetime.strftime("%H:%M"),
        "endTime": session.end_datetime.strftime("%H:%M"),
        "phase": session.phase,
        "status": session.status,
        "title": session.title,
        "attendance": attendance,
        "materials": materials,
        "students": students_status,
        "summary": {
            "totalStudents": len(students_status),
            "checkedIn": checked_in,
            "locationFailed": location_failed,
            "absent": absent,
            "totalMaterials": len(materials),
        },
    }


@app.get("/api/student/schedule")
def student_schedule(user: User = Depends(require_student)):
    profile = get_student_profile_for_user(user.id)
    current_time = now_utc()

    with get_connection() as connection:
        membership_rows = connection.execute(
            "SELECT class_group_id FROM class_memberships WHERE student_id = ? AND status = 'active'",
            (profile.id,),
        ).fetchall()
        class_ids = [row["class_group_id"] for row in membership_rows]
        if not class_ids:
            return {"schedule": [], "studentName": profile.display_name}

        class_placeholders = scoped_placeholders(class_ids)
        session_rows = connection.execute(
            f"""
            SELECT s.id, s.class_group_id, s.session_date, s.start_datetime, s.end_datetime, s.status, s.title, s.phase, s.created_at,
                   g.name AS class_name
            FROM class_sessions s
            JOIN class_groups g ON g.id = s.class_group_id
            WHERE s.class_group_id IN ({class_placeholders})
              AND s.status = 'scheduled'
              AND s.start_datetime > ?
            ORDER BY s.start_datetime ASC
            """,
            (*class_ids, current_time.isoformat()),
        ).fetchall()

    schedule = []
    for row in session_rows:
        schedule.append({
            "id": row["id"],
            "classGroupId": row["class_group_id"],
            "className": row["class_name"],
            "sessionDate": parse_date_value(row["session_date"]).isoformat(),
            "startTime": parse_datetime_value(row["start_datetime"]).strftime("%H:%M"),
            "endTime": parse_datetime_value(row["end_datetime"]).strftime("%H:%M"),
            "status": row["status"],
            "title": row["title"] or "",
        })

    return {"schedule": schedule, "studentName": profile.display_name}


@app.get("/api/student/attendance")
def student_attendance(user: User = Depends(require_student)):
    profile = get_student_profile_for_user(user.id)

    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT a.id, a.student_id, a.class_session_id, a.material_id, a.checked_in_at, a.method, a.location_status,
                   a.latitude, a.longitude, a.created_at,
                   cs.session_date, cs.start_datetime, cs.end_datetime, cs.status as session_status,
                   cg.name as class_name,
                   m.title as material_title
            FROM attendance_records a
            JOIN class_sessions cs ON cs.id = a.class_session_id
            JOIN class_groups cg ON cg.id = cs.class_group_id
            LEFT JOIN materials m ON m.id = a.material_id
            WHERE a.student_id = ?
            ORDER BY a.checked_in_at DESC
            """,
            (profile.id,),
        ).fetchall()

    attendance = []
    for row in rows:
        attendance.append({
            "id": row["id"],
            "classSessionId": row["class_session_id"],
            "className": row["class_name"],
            "sessionDate": parse_date_value(row["session_date"]).isoformat(),
            "startTime": parse_datetime_value(row["start_datetime"]).strftime("%H:%M"),
            "endTime": parse_datetime_value(row["end_datetime"]).strftime("%H:%M"),
            "checkedInAt": parse_datetime_value(row["checked_in_at"]).isoformat(),
            "locationStatus": row["location_status"],
            "materialTitle": row["material_title"] or "",
        })

    return {"attendance": attendance, "studentName": profile.display_name}


@app.get("/api/student/current-lesson")
def student_current_lesson(user: User = Depends(require_student)):
    return build_student_learning_payload(user)


@app.get("/api/student/review-materials")
def student_review_materials(user: User = Depends(require_student)):
    return {"materials": build_student_learning_payload(user)["reviewMaterials"]}


def _get_active_engineering_membership(connection, team_id: str, student_id: str):
    return connection.execute(
        """
        SELECT membership.id, membership.team_id, membership.student_id,
               membership.role, membership.status, membership.joined_at
        FROM engineering_team_memberships membership
        JOIN engineering_teams team ON team.id = membership.team_id
        WHERE membership.team_id = ? AND membership.student_id = ?
          AND membership.status = 'active' AND team.status = 'active'
        """,
        (team_id, student_id),
    ).fetchone()


def _engineering_attachments_payload(connection, note_id: str) -> list[dict]:
    rows = connection.execute(
        """
        SELECT id, record_id AS note_id, file_name, file_url, media_type, file_size, created_at
        FROM competition_engineering_record_attachments
        WHERE record_id = ? ORDER BY created_at
        """,
        (note_id,),
    ).fetchall()
    return [
        {
            "id": row["id"],
            "noteId": row["note_id"],
            "fileName": row["file_name"],
            "mediaType": row["media_type"],
            "fileSize": row["file_size"],
            "createdAt": parse_datetime_value(row["created_at"]).isoformat(),
            "downloadUrl": f"/api/engineering-note-attachments/{row['id']}/download",
        }
        for row in rows
    ]


def _engineering_note_payload(row, attachments: Optional[list[dict]] = None) -> dict:
    created_at = parse_datetime_value(row["created_at"])
    return {
        "id": row["id"],
        "teamId": row["team_id"],
        "teamName": row["team_name"],
        "studentId": row["student_id"],
        "authorName": row["author_name"],
        "classSessionId": None,
        "sessionDate": created_at.date().isoformat(),
        "recordedAt": created_at.isoformat(),
        "objective": row["objective"],
        "workCompleted": row["work_completed"],
        "reasoning": row["reasoning"],
        "alternatives": row["alternatives"],
        "testEvidence": row["test_evidence"],
        "outcome": row["outcome"],
        "problems": row["problems"],
        "resolutionStatus": row["resolution_status"],
        "resolution": row["resolution"],
        "unresolvedReason": row["unresolved_reason"],
        "nextSteps": row["next_steps"],
        "status": row["status"],
        "createdAt": created_at.isoformat(),
        "updatedAt": parse_datetime_value(row["updated_at"]).isoformat(),
        "submittedAt": None,
        "attachments": attachments or [],
    }


@app.put("/api/teacher/engineering-teams/{team_id}")
def update_engineering_team(
    team_id: str,
    request: EngineeringTeamUpdateRequest,
    user: User = Depends(require_teacher),
):
    name = request.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Team name is required.")
    with get_connection() as connection:
        current = connection.execute(
            "SELECT id FROM engineering_teams WHERE id = ?",
            (team_id,),
        ).fetchone()
        if current is None:
            raise HTTPException(status_code=404, detail="Engineering team not found.")
        connection.execute(
            "UPDATE engineering_teams SET name = ?, status = ? WHERE id = ?",
            (name, request.status, team_id),
        )
        team = next(item for item in _engineering_teams_payload(connection, [team_id]) if item["id"] == team_id)
    return {"team": team}


def _select_engineering_note(connection, note_id: str):
    return connection.execute(
        """
        SELECT n.*, t.name AS team_name, p.display_name AS author_name
        FROM competition_engineering_records n
        JOIN engineering_teams t ON t.id = n.team_id
        JOIN student_profiles p ON p.id = n.student_id
        WHERE n.id = ?
        """,
        (note_id,),
    ).fetchone()


@app.post("/api/teacher/engineering-teams")
def create_engineering_team(
    request: EngineeringTeamCreateRequest,
    user: User = Depends(require_teacher),
):
    name = request.name.strip()
    team_number = request.team_number.strip().upper()
    season = request.season.strip()
    if not name or not team_number or not re.fullmatch(r"\d{4}-\d{4}", season):
        raise HTTPException(status_code=422, detail="Team name, number, and YYYY-YYYY season are required.")

    team_id = make_id("engineering-team")
    created_at = now_utc()
    try:
        with get_connection() as connection:
            connection.execute(
                """
                INSERT INTO engineering_teams (id, name, team_number, season, status, created_by, created_at)
                VALUES (?, ?, ?, ?, 'active', ?, ?)
                """,
                (team_id, name, team_number, season, user.id, created_at.isoformat()),
            )
    except Exception as exc:
        if "unique" in str(exc).lower() or "duplicate" in str(exc).lower():
            raise HTTPException(status_code=409, detail="This team number already exists for the season.") from exc
        raise
    return {
        "team": {
            "id": team_id,
            "name": name,
            "teamNumber": team_number,
            "season": season,
            "status": "active",
            "members": [],
            "createdAt": created_at.isoformat(),
        }
    }


@app.post("/api/teacher/engineering-teams/{team_id}/members")
def add_engineering_team_member(
    team_id: str,
    request: EngineeringTeamMemberRequest,
    user: User = Depends(require_teacher),
):
    joined_at = now_utc()
    with get_connection() as connection:
        team = connection.execute(
            "SELECT id, season FROM engineering_teams WHERE id = ? AND status = 'active'",
            (team_id,),
        ).fetchone()
        if team is None:
            raise HTTPException(status_code=404, detail="Engineering team not found.")
        student = connection.execute(
            "SELECT id, display_name FROM student_profiles WHERE id = ?",
            (request.student_id,),
        ).fetchone()
        if student is None:
            raise HTTPException(status_code=404, detail="Student not found.")
        existing_season_team = connection.execute(
            """
            SELECT t.id
            FROM engineering_team_memberships m
            JOIN engineering_teams t ON t.id = m.team_id
            WHERE m.student_id = ? AND m.status = 'active' AND t.season = ? AND t.id != ?
            """,
            (request.student_id, team["season"], team_id),
        ).fetchone()
        if existing_season_team:
            raise HTTPException(status_code=409, detail="Student already belongs to another team in this season.")
        existing = connection.execute(
            "SELECT id, status FROM engineering_team_memberships WHERE team_id = ? AND student_id = ?",
            (team_id, request.student_id),
        ).fetchone()
        if existing and existing["status"] == "active":
            raise HTTPException(status_code=409, detail="Student is already on this engineering team.")
        if existing:
            membership_id = existing["id"]
            connection.execute(
                "UPDATE engineering_team_memberships SET status = 'active', role = 'member', joined_at = ? WHERE id = ?",
                (joined_at.isoformat(), membership_id),
            )
        else:
            membership_id = make_id("engineering-member")
            connection.execute(
                """
                INSERT INTO engineering_team_memberships (id, team_id, student_id, role, status, joined_at)
                VALUES (?, ?, ?, 'member', 'active', ?)
                """,
                (membership_id, team_id, request.student_id, joined_at.isoformat()),
            )
    return {
        "membership": {
            "id": membership_id,
            "teamId": team_id,
            "studentId": request.student_id,
            "studentName": student["display_name"],
            "status": "active",
        }
    }


@app.delete("/api/teacher/engineering-teams/{team_id}/members/{student_id}")
def remove_engineering_team_member(
    team_id: str,
    student_id: str,
    user: User = Depends(require_teacher),
):
    with get_connection() as connection:
        membership = connection.execute(
            """
            SELECT id FROM engineering_team_memberships
            WHERE team_id = ? AND student_id = ? AND status = 'active'
            """,
            (team_id, student_id),
        ).fetchone()
        if membership is None:
            raise HTTPException(status_code=404, detail="Active team membership not found.")
        connection.execute(
            "UPDATE engineering_team_memberships SET status = 'inactive' WHERE id = ?",
            (membership["id"],),
        )
    return {"teamId": team_id, "studentId": student_id, "status": "inactive"}


def _validate_engineering_note_request(request: EngineeringNoteWriteRequest) -> None:
    required_values = (request.objective, request.work_completed, request.reasoning, request.outcome)
    if any(not value.strip() for value in required_values):
        raise HTTPException(status_code=422, detail="Objective, work completed, reasoning, and outcome are required.")
    if request.resolution_status == "resolved" and not request.resolution.strip():
        raise HTTPException(status_code=422, detail="A resolved problem requires the resolution.")
    if request.resolution_status == "unresolved" and not request.unresolved_reason.strip():
        raise HTTPException(status_code=422, detail="An unresolved problem requires the reason it remains unresolved.")


@app.post("/api/student/engineering-notes")
def create_engineering_note(
    request: EngineeringNoteWriteRequest,
    user: User = Depends(require_student),
):
    _validate_engineering_note_request(request)
    profile = get_student_profile_for_user(user.id)
    created_at = now_utc()
    note_id = make_id("engineering-note")
    with get_connection() as connection:
        if _get_active_engineering_membership(connection, request.team_id, profile.id) is None:
            raise HTTPException(status_code=403, detail="Student is not an active member of this engineering team.")
        connection.execute(
            """
            INSERT INTO competition_engineering_records (
                id, team_id, student_id, objective, work_completed, reasoning,
                alternatives, test_evidence, outcome, problems, resolution_status, resolution,
                unresolved_reason, next_steps, status, created_at, updated_at, discarded_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, NULL)
            """,
            (
                note_id, request.team_id, profile.id,
                request.objective.strip(), request.work_completed.strip(), request.reasoning.strip(),
                request.alternatives.strip(), request.test_evidence.strip(), request.outcome.strip(),
                request.problems.strip(), request.resolution_status, request.resolution.strip(),
                request.unresolved_reason.strip(), request.next_steps.strip(),
                created_at.isoformat(), created_at.isoformat(),
            ),
        )
        row = _select_engineering_note(connection, note_id)
    return {"note": _engineering_note_payload(row)}


@app.put("/api/student/engineering-notes/{note_id}")
def update_engineering_note(
    note_id: str,
    request: EngineeringNoteWriteRequest,
    user: User = Depends(require_student),
):
    _validate_engineering_note_request(request)
    profile = get_student_profile_for_user(user.id)
    with get_connection() as connection:
        current = connection.execute(
            "SELECT id, student_id, status, team_id FROM competition_engineering_records WHERE id = ?",
            (note_id,),
        ).fetchone()
        if current is None or current["student_id"] != profile.id:
            raise HTTPException(status_code=404, detail="Engineering note not found.")
        if request.team_id != current["team_id"]:
            raise HTTPException(status_code=409, detail="A record cannot be moved to another team.")
        if current["status"] == "discarded":
            raise HTTPException(status_code=409, detail="Restore this record before editing it.")
        if _get_active_engineering_membership(connection, current["team_id"], profile.id) is None:
            raise HTTPException(status_code=403, detail="Former team members can only read historical records.")
        updated_at = now_utc()
        connection.execute(
            """
            UPDATE competition_engineering_records
            SET objective = ?, work_completed = ?, reasoning = ?, alternatives = ?, test_evidence = ?,
                outcome = ?, problems = ?, resolution_status = ?, resolution = ?, unresolved_reason = ?,
                next_steps = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                request.objective.strip(), request.work_completed.strip(), request.reasoning.strip(),
                request.alternatives.strip(), request.test_evidence.strip(), request.outcome.strip(),
                request.problems.strip(), request.resolution_status, request.resolution.strip(),
                request.unresolved_reason.strip(), request.next_steps.strip(), updated_at.isoformat(), note_id,
            ),
        )
        row = _select_engineering_note(connection, note_id)
    return {"note": _engineering_note_payload(row)}


@app.post("/api/student/engineering-notes/{note_id}/attachments")
async def upload_engineering_note_attachment(
    note_id: str,
    file: UploadFile = File(...),
    user: User = Depends(require_student),
):
    profile = get_student_profile_for_user(user.id)
    original_name = Path(file.filename or "").name
    suffix = Path(original_name).suffix.lower()
    allowed_extensions = {".png", ".jpg", ".jpeg", ".webp", ".pdf"}
    if not original_name or suffix not in allowed_extensions:
        raise HTTPException(status_code=422, detail="Attach a PNG, JPG, WEBP, or PDF evidence file.")
    content = await file.read()
    if not content:
        raise HTTPException(status_code=422, detail="Attachment is empty.")
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Attachment must be 10 MB or smaller.")
    attachment_id = make_id("engineering-attachment")
    safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", original_name)
    relative_url = f"{note_id}/{attachment_id}-{safe_name}"
    created_at = now_utc()
    with get_connection() as connection:
        note = connection.execute(
            "SELECT id, team_id, student_id, status FROM competition_engineering_records WHERE id = ?",
            (note_id,),
        ).fetchone()
        if note is None or note["student_id"] != profile.id:
            raise HTTPException(status_code=404, detail="Engineering note not found.")
        if note["status"] == "discarded" or _get_active_engineering_membership(connection, note["team_id"], profile.id) is None:
            raise HTTPException(status_code=403, detail="This historical record is read-only.")
        storage_root = settings.materials_storage_dir.parent / "engineering-notebooks"
        destination = storage_root / relative_url
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(content)
        media_type = file.content_type or mimetypes.guess_type(original_name)[0] or "application/octet-stream"
        connection.execute(
            """
            INSERT INTO competition_engineering_record_attachments (
                id, record_id, file_name, file_url, media_type, file_size, uploaded_by, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                attachment_id, note_id, original_name, relative_url, media_type,
                len(content), profile.id, created_at.isoformat(),
            ),
        )
        attachment = _engineering_attachments_payload(connection, note_id)[-1]
    return {"attachment": attachment}


@app.get("/api/engineering-note-attachments/{attachment_id}/download")
def download_engineering_note_attachment(
    attachment_id: str,
    user: User = Depends(get_current_user),
):
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT a.id, a.file_name, a.file_url, a.media_type, n.id AS record_id, n.team_id
            FROM competition_engineering_record_attachments a
            JOIN competition_engineering_records n ON n.id = a.record_id
            WHERE a.id = ?
            """,
            (attachment_id,),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Engineering note attachment not found.")
        if user.role == "Student":
            profile = get_student_profile_for_user(user.id)
            own_record = connection.execute(
                "SELECT id FROM competition_engineering_records WHERE id = ? AND student_id = ?",
                (row["record_id"], profile.id),
            ).fetchone()
            membership = connection.execute(
                "SELECT id FROM engineering_team_memberships WHERE team_id = ? AND student_id = ?",
                (row["team_id"], profile.id),
            ).fetchone()
            if own_record is None and membership is None:
                raise HTTPException(status_code=403, detail="Student cannot access another team's evidence.")
    file_path = settings.materials_storage_dir.parent / "engineering-notebooks" / row["file_url"]
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Engineering note attachment file not found.")
    return FileResponse(
        file_path,
        filename=row["file_name"],
        media_type=row["media_type"],
        content_disposition_type="inline",
    )


@app.post("/api/student/engineering-notes/{note_id}/submit")
def submit_engineering_note(note_id: str, user: User = Depends(require_student)):
    profile = get_student_profile_for_user(user.id)
    submitted_at = now_utc()
    with get_connection() as connection:
        current = connection.execute(
            "SELECT id, student_id, status FROM competition_engineering_records WHERE id = ?",
            (note_id,),
        ).fetchone()
        if current is None or current["student_id"] != profile.id:
            raise HTTPException(status_code=404, detail="Engineering note not found.")
        row = _select_engineering_note(connection, note_id)
    return {"note": _engineering_note_payload(row)}


@app.put("/api/student/engineering-notes/{note_id}/status")
def update_engineering_note_status(
    note_id: str,
    status: Literal["active", "discarded"] = Query(...),
    user: User = Depends(require_student),
):
    profile = get_student_profile_for_user(user.id)
    changed_at = now_utc()
    with get_connection() as connection:
        current = connection.execute(
            "SELECT id, team_id, student_id FROM competition_engineering_records WHERE id = ?",
            (note_id,),
        ).fetchone()
        if current is None or current["student_id"] != profile.id:
            raise HTTPException(status_code=404, detail="Engineering note not found.")
        if _get_active_engineering_membership(connection, current["team_id"], profile.id) is None:
            raise HTTPException(status_code=403, detail="Former team members cannot change historical records.")
        connection.execute(
            """
            UPDATE competition_engineering_records
            SET status = ?, discarded_at = ?, updated_at = ?
            WHERE id = ?
            """,
            (status, changed_at.isoformat() if status == "discarded" else None, changed_at.isoformat(), note_id),
        )
        row = _select_engineering_note(connection, note_id)
    return {"note": _engineering_note_payload(row)}


def _select_engineering_proposal(connection, proposal_id: str):
    return connection.execute(
        """
        SELECT p.*, t.name AS team_name, t.team_number, t.season,
               author.display_name AS proposer_name, s.session_date
        FROM engineering_merge_proposals p
        JOIN engineering_teams t ON t.id = p.team_id
        JOIN student_profiles author ON author.id = p.proposed_by
        JOIN class_sessions s ON s.id = p.class_session_id
        WHERE p.id = ?
        """,
        (proposal_id,),
    ).fetchone()


def _engineering_proposal_payload(connection, row, current_student_id: Optional[str] = None) -> dict:
    source_rows = connection.execute(
        """
        SELECT n.id, n.student_id, author.display_name AS author_name, n.objective, n.updated_at
        FROM engineering_merge_sources source
        JOIN engineering_notes n ON n.id = source.note_id
        JOIN student_profiles author ON author.id = n.student_id
        WHERE source.proposal_id = ?
        ORDER BY n.updated_at, n.created_at
        """,
        (row["id"],),
    ).fetchall()
    confirmation_rows = connection.execute(
        """
        SELECT c.student_id, author.display_name AS student_name, c.confirmed_at
        FROM engineering_merge_confirmations c
        JOIN student_profiles author ON author.id = c.student_id
        WHERE c.proposal_id = ?
        ORDER BY c.confirmed_at
        """,
        (row["id"],),
    ).fetchall()
    required_author_ids = sorted({source["student_id"] for source in source_rows})
    confirmed_ids = {confirmation["student_id"] for confirmation in confirmation_rows}
    current_membership = None
    if current_student_id:
        current_membership = _get_active_engineering_membership(
            connection, row["team_id"], current_student_id
        )
    return {
        "id": row["id"],
        "teamId": row["team_id"],
        "teamName": row["team_name"],
        "teamNumber": row["team_number"],
        "season": row["season"],
        "classSessionId": row["class_session_id"],
        "sessionDate": parse_date_value(row["session_date"]).isoformat(),
        "title": row["title"],
        "objective": row["objective"],
        "workCompleted": row["work_completed"],
        "reasoning": row["reasoning"],
        "alternatives": row["alternatives"],
        "testEvidence": row["test_evidence"],
        "outcome": row["outcome"],
        "problems": row["problems"],
        "resolutionStatus": row["resolution_status"],
        "resolution": row["resolution"],
        "unresolvedReason": row["unresolved_reason"],
        "nextSteps": row["next_steps"],
        "proposedBy": row["proposed_by"],
        "proposerName": row["proposer_name"],
        "status": row["status"],
        "sequenceNumber": row["sequence_number"],
        "createdAt": parse_datetime_value(row["created_at"]).isoformat(),
        "publishedAt": parse_datetime_value(row["published_at"]).isoformat() if row["published_at"] else None,
        "sources": [
            {
                "noteId": source["id"],
                "studentId": source["student_id"],
                "authorName": source["author_name"],
                "objective": source["objective"],
                "savedAt": parse_datetime_value(source["updated_at"]).isoformat(),
                "attachments": _engineering_attachments_payload(connection, source["id"]),
            }
            for source in source_rows
        ],
        "requiredAuthorIds": required_author_ids,
        "confirmations": [
            {
                "studentId": confirmation["student_id"],
                "studentName": confirmation["student_name"],
                "confirmedAt": parse_datetime_value(confirmation["confirmed_at"]).isoformat(),
            }
            for confirmation in confirmation_rows
        ],
        "allSourcesConfirmed": set(required_author_ids).issubset(confirmed_ids),
        "canConfirm": bool(
            current_student_id
            and row["status"] == "pending"
            and current_student_id in required_author_ids
            and current_student_id not in confirmed_ids
        ),
        "canPublish": bool(
            current_membership
            and current_membership["role"] == "notebooker"
            and row["status"] == "pending"
            and set(required_author_ids).issubset(confirmed_ids)
        ),
    }


@app.post("/api/student/engineering-merge-proposals")
def create_engineering_merge_proposal(
    request: EngineeringMergeProposalCreateRequest,
    user: User = Depends(require_student),
):
    raise HTTPException(status_code=410, detail="Stage Merge is not available in Competition phase one.")
    _validate_engineering_note_request(request)
    title = request.title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="A team entry title is required.")
    profile = get_student_profile_for_user(user.id)
    unique_note_ids = list(dict.fromkeys(request.source_note_ids))
    created_at = now_utc()
    proposal_id = make_id("engineering-merge")
    with get_connection() as connection:
        if _get_active_engineering_membership(connection, request.team_id, profile.id) is None:
            raise HTTPException(status_code=403, detail="Student is not an active member of this engineering team.")
        placeholders = scoped_placeholders(unique_note_ids)
        source_rows = connection.execute(
            f"""
            SELECT id, team_id, class_session_id, student_id, status
            FROM engineering_notes
            WHERE id IN ({placeholders})
            """,
            tuple(unique_note_ids),
        ).fetchall()
        if len(source_rows) != len(unique_note_ids):
            raise HTTPException(status_code=404, detail="One or more source engineering notes were not found.")
        if any(row["team_id"] != request.team_id for row in source_rows):
            raise HTTPException(status_code=403, detail="All source notes must belong to the same engineering team.")
        if any(row["class_session_id"] != request.class_session_id for row in source_rows):
            raise HTTPException(status_code=409, detail="Source notes must belong to the selected class session.")
        already_proposed = connection.execute(
            f"""
            SELECT source.note_id
            FROM engineering_merge_sources source
            JOIN engineering_merge_proposals proposal ON proposal.id = source.proposal_id
            WHERE source.note_id IN ({placeholders}) AND proposal.status IN ('pending', 'published')
            """,
            tuple(unique_note_ids),
        ).fetchone()
        if already_proposed:
            raise HTTPException(status_code=409, detail="A source record is already part of another merge proposal.")
        connection.execute(
            """
            INSERT INTO engineering_merge_proposals (
                id, team_id, class_session_id, title, objective, work_completed, reasoning,
                alternatives, test_evidence, outcome, problems, resolution_status, resolution,
                unresolved_reason, next_steps, proposed_by, status, sequence_number, created_at, published_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?, NULL)
            """,
            (
                proposal_id, request.team_id, request.class_session_id, title,
                request.objective.strip(), request.work_completed.strip(), request.reasoning.strip(),
                request.alternatives.strip(), request.test_evidence.strip(), request.outcome.strip(),
                request.problems.strip(), request.resolution_status, request.resolution.strip(),
                request.unresolved_reason.strip(), request.next_steps.strip(), profile.id, created_at.isoformat(),
            ),
        )
        for note_id in unique_note_ids:
            connection.execute(
                "INSERT INTO engineering_merge_sources (id, proposal_id, note_id) VALUES (?, ?, ?)",
                (make_id("engineering-source"), proposal_id, note_id),
            )
        row = _select_engineering_proposal(connection, proposal_id)
        payload = _engineering_proposal_payload(connection, row, profile.id)
    return {"proposal": payload}


@app.post("/api/student/engineering-merge-proposals/{proposal_id}/confirm")
def confirm_engineering_merge_proposal(
    proposal_id: str,
    user: User = Depends(require_student),
):
    raise HTTPException(status_code=410, detail="Stage Merge is not available in Competition phase one.")
    profile = get_student_profile_for_user(user.id)
    confirmed_at = now_utc()
    with get_connection() as connection:
        row = _select_engineering_proposal(connection, proposal_id)
        if row is None or _get_active_engineering_membership(connection, row["team_id"], profile.id) is None:
            raise HTTPException(status_code=404, detail="Merge proposal not found.")
        if row["status"] != "pending":
            raise HTTPException(status_code=409, detail="Published entries cannot receive new confirmations.")
        required = connection.execute(
            """
            SELECT source.id
            FROM engineering_merge_sources source
            JOIN engineering_notes note ON note.id = source.note_id
            WHERE source.proposal_id = ? AND note.student_id = ?
            """,
            (proposal_id, profile.id),
        ).fetchone()
        if required is None:
            raise HTTPException(status_code=403, detail="Only a source note author can confirm this proposal.")
        existing = connection.execute(
            "SELECT id FROM engineering_merge_confirmations WHERE proposal_id = ? AND student_id = ?",
            (proposal_id, profile.id),
        ).fetchone()
        if existing is None:
            connection.execute(
                """
                INSERT INTO engineering_merge_confirmations (id, proposal_id, student_id, confirmed_at)
                VALUES (?, ?, ?, ?)
                """,
                (make_id("engineering-confirmation"), proposal_id, profile.id, confirmed_at.isoformat()),
            )
        refreshed = _select_engineering_proposal(connection, proposal_id)
        payload = _engineering_proposal_payload(connection, refreshed, profile.id)
    return {"proposal": payload}


@app.post("/api/student/engineering-merge-proposals/{proposal_id}/publish")
def publish_engineering_merge_proposal(
    proposal_id: str,
    user: User = Depends(require_student),
):
    raise HTTPException(status_code=410, detail="Stage Merge is not available in Competition phase one.")
    profile = get_student_profile_for_user(user.id)
    published_at = now_utc()
    with get_connection() as connection:
        row = _select_engineering_proposal(connection, proposal_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Merge proposal not found.")
        membership = _get_active_engineering_membership(connection, row["team_id"], profile.id)
        if membership is None or membership["role"] != "notebooker":
            raise HTTPException(status_code=403, detail="Only the team's Notebooker can publish a confirmed entry.")
        if row["status"] != "pending":
            raise HTTPException(status_code=409, detail="This team entry has already been published.")
        required_rows = connection.execute(
            """
            SELECT DISTINCT note.student_id
            FROM engineering_merge_sources source
            JOIN engineering_notes note ON note.id = source.note_id
            WHERE source.proposal_id = ?
            """,
            (proposal_id,),
        ).fetchall()
        confirmed_rows = connection.execute(
            "SELECT student_id FROM engineering_merge_confirmations WHERE proposal_id = ?",
            (proposal_id,),
        ).fetchall()
        required_ids = {item["student_id"] for item in required_rows}
        confirmed_ids = {item["student_id"] for item in confirmed_rows}
        if not required_ids.issubset(confirmed_ids):
            raise HTTPException(status_code=409, detail="Every source note author must confirm before publication.")
        next_sequence = connection.execute(
            """
            SELECT COALESCE(MAX(sequence_number), 0) + 1 AS next_sequence
            FROM engineering_merge_proposals
            WHERE team_id = ? AND status = 'published'
            """,
            (row["team_id"],),
        ).fetchone()["next_sequence"]
        connection.execute(
            """
            UPDATE engineering_merge_proposals
            SET status = 'published', sequence_number = ?, published_at = ?
            WHERE id = ?
            """,
            (next_sequence, published_at.isoformat(), proposal_id),
        )
        connection.execute(
            """
            UPDATE engineering_notes SET status = 'merged', updated_at = ?
            WHERE id IN (SELECT note_id FROM engineering_merge_sources WHERE proposal_id = ?)
            """,
            (published_at.isoformat(), proposal_id),
        )
        published = _select_engineering_proposal(connection, proposal_id)
        payload = _engineering_proposal_payload(connection, published, profile.id)
    return {"entry": payload}


def _engineering_teams_payload(connection, team_ids: Optional[list[str]] = None) -> list[dict]:
    parameters: tuple = ()
    where_clause = ""
    if team_ids is not None:
        if not team_ids:
            return []
        where_clause = f"WHERE t.id IN ({scoped_placeholders(team_ids)})"
        parameters = tuple(team_ids)
    team_rows = connection.execute(
        f"""
        SELECT t.id, t.name, t.team_number, t.season, t.status, t.created_at
        FROM engineering_teams t
        {where_clause}
        ORDER BY t.season DESC, t.team_number
        """,
        parameters,
    ).fetchall()
    teams = []
    for team in team_rows:
        members = connection.execute(
            """
            SELECT m.student_id, m.role, p.display_name
            FROM engineering_team_memberships m
            JOIN student_profiles p ON p.id = m.student_id
            WHERE m.team_id = ? AND m.status = 'active'
            ORDER BY CASE WHEN m.role = 'notebooker' THEN 0 ELSE 1 END, p.display_name
            """,
            (team["id"],),
        ).fetchall()
        teams.append({
            "id": team["id"],
            "name": team["name"],
            "teamNumber": team["team_number"],
            "season": team["season"],
            "status": team["status"],
            "createdAt": parse_datetime_value(team["created_at"]).isoformat(),
            "exportSpec": ENGINEERING_NOTEBOOK_SEASON_SPECS.get(team["season"]),
            "members": [
                {"studentId": member["student_id"], "studentName": member["display_name"]}
                for member in members
            ],
        })
    return teams


def _engineering_workspace_payload(user: User, *, teacher_view: bool) -> dict:
    with get_connection() as connection:
        current_student_id = None
        active_team_ids: set[str] = set()
        if teacher_view:
            team_ids = [item["id"] for item in _engineering_teams_payload(connection)]
        else:
            profile = get_student_profile_for_user(user.id)
            current_student_id = profile.id
            membership_rows = connection.execute(
                """
                SELECT team_id, status FROM engineering_team_memberships
                WHERE student_id = ?
                """,
                (profile.id,),
            ).fetchall()
            team_ids = [item["team_id"] for item in membership_rows]
            active_team_ids = {item["team_id"] for item in membership_rows if item["status"] == "active"}
        teams = _engineering_teams_payload(connection, team_ids)
        if not team_ids:
            return {"teams": [], "sessions": [], "notes": [], "proposals": [], "publishedEntries": [], "submissionProgress": []}
        team_placeholders = scoped_placeholders(team_ids)
        note_rows = connection.execute(
            f"""
            SELECT n.*, t.name AS team_name, author.display_name AS author_name
            FROM competition_engineering_records n
            JOIN engineering_teams t ON t.id = n.team_id
            JOIN student_profiles author ON author.id = n.student_id
            WHERE n.team_id IN ({team_placeholders})
            ORDER BY n.created_at DESC
            """,
            tuple(team_ids),
        ).fetchall()
        notes = [
            {
                **_engineering_note_payload(note, _engineering_attachments_payload(connection, note["id"])),
                "canEdit": bool(
                    current_student_id
                    and note["student_id"] == current_student_id
                    and note["team_id"] in active_team_ids
                    and note["status"] != "discarded"
                ),
            }
            for note in note_rows
        ]
        if not teacher_view:
            notes = [note for note in notes if note["studentId"] == current_student_id]
        return {
            "teams": teams,
            "sessions": [],
            "notes": notes,
            "proposals": [],
            "publishedEntries": [],
            "submissionProgress": [],
        }

        # Legacy class-session merge workflow is intentionally dormant in Competition phase one.
        proposal_rows = connection.execute(
            f"""
            SELECT p.*, t.name AS team_name, t.team_number, t.season,
                   author.display_name AS proposer_name, s.session_date
            FROM engineering_merge_proposals p
            JOIN engineering_teams t ON t.id = p.team_id
            JOIN student_profiles author ON author.id = p.proposed_by
            JOIN class_sessions s ON s.id = p.class_session_id
            WHERE p.team_id IN ({team_placeholders})
            ORDER BY CASE WHEN p.status = 'pending' THEN 0 ELSE 1 END,
                     p.sequence_number DESC, p.created_at DESC
            """,
            tuple(team_ids),
        ).fetchall()
        if teacher_view:
            session_rows = connection.execute(
                """
                SELECT s.id, s.session_date, g.name AS class_name
                FROM class_sessions s JOIN class_groups g ON g.id = s.class_group_id
                WHERE s.status != 'cancelled' ORDER BY s.session_date DESC
                """
            ).fetchall()
        else:
            session_rows = connection.execute(
                """
                SELECT DISTINCT s.id, s.session_date, g.name AS class_name
                FROM class_sessions s
                JOIN class_groups g ON g.id = s.class_group_id
                JOIN class_memberships m ON m.class_group_id = g.id
                WHERE m.student_id = ? AND m.status = 'active' AND s.status != 'cancelled'
                ORDER BY s.session_date DESC
                """,
                (current_student_id,),
            ).fetchall()
        proposals = [
            _engineering_proposal_payload(connection, proposal, current_student_id)
            for proposal in proposal_rows
        ]
        progress_rows = connection.execute(
            f"""
            SELECT team.id AS team_id, team.team_number, member.student_id,
                   profile.display_name AS student_name, session.id AS class_session_id,
                   session.session_date, session.end_datetime, class_group.name AS class_name,
                   note.id AS note_id, note.status AS note_status, note.submitted_at
            FROM engineering_team_memberships member
            JOIN engineering_teams team ON team.id = member.team_id
            JOIN student_profiles profile ON profile.id = member.student_id
            JOIN class_memberships class_member
              ON class_member.student_id = member.student_id AND class_member.status = 'active'
            JOIN class_sessions session
              ON session.class_group_id = class_member.class_group_id AND session.status != 'cancelled'
            JOIN class_groups class_group ON class_group.id = session.class_group_id
            LEFT JOIN engineering_notes note
              ON note.team_id = team.id
             AND note.student_id = member.student_id
             AND note.class_session_id = session.id
            WHERE member.status = 'active'
              AND team.id IN ({team_placeholders})
              AND session.end_datetime >= member.joined_at
              AND EXISTS (
                  SELECT 1 FROM engineering_notes team_note
                  WHERE team_note.team_id = team.id AND team_note.class_session_id = session.id
              )
            ORDER BY session.session_date DESC, team.team_number, profile.display_name
            """,
            tuple(team_ids),
        ).fetchall()
        current_time = now_utc()
        return {
            "teams": teams,
            "sessions": [
                {"id": session["id"], "sessionDate": parse_date_value(session["session_date"]).isoformat(), "className": session["class_name"]}
                for session in session_rows
            ],
            "notes": [
                {
                    **_engineering_note_payload(note, _engineering_attachments_payload(connection, note["id"])),
                    "canEdit": bool(current_student_id and note["student_id"] == current_student_id),
                }
                for note in note_rows
            ],
            "proposals": [proposal for proposal in proposals if proposal["status"] == "pending"],
            "publishedEntries": [proposal for proposal in proposals if proposal["status"] == "published"],
            "submissionProgress": [
                {
                    "teamId": progress["team_id"],
                    "teamNumber": progress["team_number"],
                    "studentId": progress["student_id"],
                    "studentName": progress["student_name"],
                    "classSessionId": progress["class_session_id"],
                    "sessionDate": parse_date_value(progress["session_date"]).isoformat(),
                    "className": progress["class_name"],
                    "isDue": parse_datetime_value(progress["end_datetime"]) <= current_time,
                    "status": "merged" if progress["note_status"] == "merged" else "saved" if progress["note_id"] else (
                        "missing" if parse_datetime_value(progress["end_datetime"]) <= current_time else "upcoming"
                    ),
                    "noteId": progress["note_id"],
                    "submittedAt": parse_datetime_value(progress["submitted_at"]).isoformat() if progress["submitted_at"] else None,
                }
                for progress in progress_rows
            ],
        }


@app.get("/api/student/engineering-notebook")
def student_engineering_notebook(user: User = Depends(require_student)):
    return _engineering_workspace_payload(user, teacher_view=False)


@app.get("/api/teacher/engineering-notebooks")
def teacher_engineering_notebooks(user: User = Depends(require_teacher)):
    return _engineering_workspace_payload(user, teacher_view=True)


def _pdf_text(value: str) -> str:
    return html.escape(value or "").replace("\n", "<br>")


@app.get("/api/engineering-teams/{team_id}/notebook.pdf")
def export_engineering_notebook_pdf(team_id: str, user: User = Depends(get_current_user)):
    with get_connection() as connection:
        team = connection.execute(
            "SELECT id, name, team_number, season FROM engineering_teams WHERE id = ?",
            (team_id,),
        ).fetchone()
        if team is None:
            raise HTTPException(status_code=404, detail="Engineering team not found.")
        if user.role == "Student":
            profile = get_student_profile_for_user(user.id)
            membership = connection.execute(
                "SELECT id FROM engineering_team_memberships WHERE team_id = ? AND student_id = ?",
                (team_id, profile.id),
            ).fetchone()
            if membership is None:
                raise HTTPException(status_code=403, detail="Student cannot export another team's notebook.")
        entry_rows = connection.execute(
            """
            SELECT record.*, author.display_name AS author_name
            FROM competition_engineering_records record
            JOIN student_profiles author ON author.id = record.student_id
            WHERE record.team_id = ? AND record.status = 'active'
            ORDER BY record.created_at, record.id
            """,
            (team_id,),
        ).fetchall()
        entries = []
        for index, row in enumerate(entry_rows, start=1):
            entry = {
                **_engineering_note_payload({**dict(row), "team_name": team["name"]}),
                "sequenceNumber": index,
                "title": row["objective"],
                "sources": [{"authorName": row["author_name"]}],
            }
            attachment_rows = connection.execute(
                """
                SELECT a.file_name, a.file_url, a.media_type
                FROM competition_engineering_record_attachments a
                WHERE a.record_id = ?
                ORDER BY a.created_at
                """,
                (row["id"],),
            ).fetchall()
            entry["_exportAttachments"] = [dict(item) for item in attachment_rows]
            entries.append(entry)

    season_spec = ENGINEERING_NOTEBOOK_SEASON_SPECS.get(team["season"])
    game_name = (
        f"{season_spec['competition']} {season_spec['game']}"
        if season_spec else "VEX IQ Robotics Competition"
    )
    sections = []
    field_labels = (
        ("Objective / Problem", "objective"),
        ("Work Completed", "workCompleted"),
        ("Why We Chose This Approach", "reasoning"),
        ("Alternatives Considered", "alternatives"),
        ("Test Evidence", "testEvidence"),
        ("Outcome", "outcome"),
        ("Problems Found", "problems"),
        ("Resolution", "resolution"),
        ("Why It Remains Unresolved", "unresolvedReason"),
        ("Next Steps", "nextSteps"),
    )
    for entry in entries:
        authors = ", ".join(source["authorName"] for source in entry["sources"])
        fields = "".join(
            f"<section><h3>{label}</h3><p>{_pdf_text(entry[key]) or '—'}</p></section>"
            for label, key in field_labels
        )
        attachment_markup = []
        for attachment in entry["_exportAttachments"]:
            attachment_path = settings.materials_storage_dir.parent / "engineering-notebooks" / attachment["file_url"]
            attachment_markup.append(f"<h3>Evidence: {_pdf_text(attachment['file_name'])}</h3>")
            if attachment["media_type"].startswith("image/") and attachment_path.is_file():
                encoded = base64.b64encode(attachment_path.read_bytes()).decode("ascii")
                attachment_markup.append(
                    f'<img class="evidence" src="data:{attachment["media_type"]};base64,{encoded}">'
                )
        sections.append(
            f"""
            <article class="entry">
              <h2>Entry {entry['sequenceNumber']}: {_pdf_text(entry['title'])}</h2>
              <p class="meta"><b>Recorded:</b> {_pdf_text(entry['recordedAt'])} &nbsp; <b>Author:</b> {_pdf_text(authors)}</p>
              <p class="meta"><b>Resolution status:</b> {_pdf_text(entry['resolutionStatus'].replace('_', ' ').title())}</p>
              {fields}
              {''.join(attachment_markup)}
            </article>
            """
        )
    notebook_html = f"""
      <main>
        <section class="cover">
          <p class="eyebrow">{_pdf_text(game_name)}</p>
          <h1>Engineering Notebook</h1>
          <h2>{_pdf_text(team['name'])}</h2>
          <p><b>Team:</b> {_pdf_text(team['team_number'])}</p>
          <p><b>Season:</b> {_pdf_text(team['season'])}</p>
          {f'<p class="meta">Official game manual {season_spec["manualVersion"]} · Published {season_spec["manualPublishedAt"]}<br>Engineering Notebook Rubric {season_spec["rubricVersion"]}</p>' if season_spec else ''}
          <p class="integrity">All engineering content in this notebook was written by student team members. RoBoGo preserves authorship, timestamps, evidence, and renders the records without rewriting them.</p>
        </section>
        {''.join(sections) if sections else '<p>No active engineering records yet.</p>'}
      </main>
    """
    css = """
      @page { size: A4; margin: 14mm; }
      body { font-family: sans-serif; color: #17233b; font-size: 10.5pt; line-height: 1.45; }
      .cover { padding-top: 55mm; text-align: center; page-break-after: always; }
      .cover h1 { font-size: 30pt; color: #ea5b35; margin: 8mm 0 3mm; }
      .cover h2 { font-size: 20pt; }
      .eyebrow { color: #5a6880; text-transform: uppercase; letter-spacing: 1px; }
      .integrity { margin: 25mm auto 0; max-width: 140mm; color: #5a6880; font-size: 9pt; }
      .entry { page-break-before: always; }
      .entry h2 { color: #ea5b35; border-bottom: 1px solid #d8dee9; padding-bottom: 3mm; }
      .entry h3 { font-size: 11pt; margin: 4mm 0 1mm; }
      .entry p { margin: 0 0 2mm; white-space: normal; }
      .meta { color: #5a6880; font-size: 9pt; }
      .evidence { max-width: 160mm; max-height: 105mm; border: 1px solid #d8dee9; }
    """
    try:
        import fitz

        story = fitz.Story(notebook_html, user_css=css)

        def page_rect(rect_number, filled):
            page = fitz.paper_rect("a4")
            return page, page + (40, 42, -40, -42), fitz.Matrix(1, 1)

        document = story.write_with_links(page_rect)
        pdf_bytes = document.tobytes(garbage=4, deflate=True)
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Engineering notebook PDF could not be generated.") from exc
    filename = re.sub(r"[^A-Za-z0-9._-]", "_", f"{team['team_number']}-{team['season']}-engineering-notebook.pdf")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/api/materials/{material_id}/open")
def open_material(
    material_id: str,
    request: MaterialOpenRequest,
    user: User = Depends(require_student),
):
    profile = get_student_profile_for_user(user.id)
    material = get_material(material_id)
    location_status = resolve_location_status(request)
    opened_at = now_utc()
    current_session = get_class_session(request.class_session_id) if request.class_session_id else None

    if request.source == "current_lesson":
        if current_session is None:
            raise HTTPException(status_code=422, detail="Current lesson open requires a class session.")
        assignment = find_assignment_for_student_material(profile, material_id, current_session.id)
        if assignment is None:
            raise HTTPException(status_code=403, detail="This material is not assigned to the student for the current session.")
        if not is_session_active(current_session, opened_at):
            location_status = "outside"
    else:
        assignment = find_assignment_for_student_material(profile, material_id, request.class_session_id)
        if assignment is None:
            raise HTTPException(status_code=403, detail="This material is not available in the student's review history.")

    view_record = MaterialViewRecord(
        id=make_id("view"),
        student_id=profile.id,
        material_id=material.id,
        class_session_id=current_session.id if current_session else request.class_session_id,
        view_source=request.source,
        opened_at=opened_at,
        location_status=location_status,
        latitude=request.latitude,
        longitude=request.longitude,
    )

    attendance_record = None
    attendance_created = False
    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO material_view_records (
                id, student_id, material_id, class_session_id, view_source, opened_at, location_status, latitude, longitude
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                view_record.id,
                view_record.student_id,
                view_record.material_id,
                view_record.class_session_id,
                view_record.view_source,
                view_record.opened_at.isoformat(),
                view_record.location_status,
                view_record.latitude,
                view_record.longitude,
            ),
        )

        if request.source == "current_lesson" and current_session is not None and location_status == "valid":
            existing_attendance = connection.execute(
                """
                SELECT id, student_id, class_session_id, material_id, checked_in_at, method, location_status, latitude, longitude, created_at
                FROM attendance_records
                WHERE student_id = ? AND class_session_id = ?
                """,
                (profile.id, current_session.id),
            ).fetchone()
            if existing_attendance is None:
                attendance_record = AttendanceRecord(
                    id=make_id("attendance"),
                    student_id=profile.id,
                    class_session_id=current_session.id,
                    material_id=material.id,
                    checked_in_at=opened_at,
                    latitude=request.latitude,
                    longitude=request.longitude,
                    created_at=opened_at,
                )
                connection.execute(
                    """
                    INSERT INTO attendance_records (
                        id, student_id, class_session_id, material_id, checked_in_at, method, location_status, latitude, longitude, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        attendance_record.id,
                        attendance_record.student_id,
                        attendance_record.class_session_id,
                        attendance_record.material_id,
                        attendance_record.checked_in_at.isoformat(),
                        attendance_record.method,
                        attendance_record.location_status,
                        attendance_record.latitude,
                        attendance_record.longitude,
                        attendance_record.created_at.isoformat(),
                    ),
                )
                attendance_created = True
            else:
                attendance_record = row_to_attendance_record(existing_attendance)

    return {
        "materialId": material.id,
        "viewRecordId": view_record.id,
        "locationStatus": location_status,
        "attendanceRecorded": attendance_created,
        "attendanceAlreadyExists": attendance_record is not None and not attendance_created,
        "attendance": {
            "id": attendance_record.id,
            "checkedInAt": attendance_record.checked_in_at.isoformat(),
            "locationStatus": attendance_record.location_status,
        }
        if attendance_record
        else None,
    }


app.mount("/static", StaticFiles(directory=settings.public_dir), name="static")


@app.get("/{path:path}")
def spa(path: str):
    return FileResponse(settings.public_dir / "index.html")




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

try:
    _migrate_add_phase_column()
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

try:
    _migrate_add_phase_tag_column()
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
    _migrate_add_sort_order_column()
except Exception:
    pass


@app.put("/api/teacher/assignments/{assignment_id}/move")
def move_assignment(assignment_id: str, direction: str = Form(...), user: User = Depends(require_teacher)):
    if direction not in ("up", "down"):
        raise HTTPException(status_code=422, detail="Direction must be 'up' or 'down'.")

    with get_connection() as connection:
        row = connection.execute(
            "SELECT id, class_session_id, sort_order FROM session_material_assignments WHERE id = ?",
            (assignment_id,),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Assignment not found.")

        current_order = row["sort_order"]
        session_id = row["class_session_id"]
        delta = -1 if direction == "up" else 1

        swap_row = connection.execute(
            "SELECT id, sort_order FROM session_material_assignments WHERE class_session_id = ? AND sort_order = ? AND id != ?",
            (session_id, current_order + delta, assignment_id),
        ).fetchone()

        if swap_row:
            connection.execute(
                "UPDATE session_material_assignments SET sort_order = ? WHERE id = ?",
                (current_order, swap_row["id"]),
            )
        connection.execute(
            "UPDATE session_material_assignments SET sort_order = ? WHERE id = ?",
            (current_order + delta, assignment_id),
        )

    return {"assignmentId": assignment_id, "direction": direction}

init_database()
