"""Data models and constants."""
from datetime import date, datetime
from typing import Literal, Optional
from pydantic import BaseModel, Field

MATERIAL_DIRECTORY_MAP = {
    "pdf": "pdfs",
    "ppt": "presentations",
    "image": "images",
    "video": "videos",
    "link": "links",
    "other": "other",
}

MATERIAL_ALLOWED_EXTENSIONS = {
    "pdf": {".pdf"},
    "ppt": {".ppt", ".pptx"},
    "image": {".jpg", ".jpeg", ".png", ".gif", ".webp"},
    "video": {".mp4", ".mov", ".m4v", ".webm"},
    "other": set(),
}

MATERIAL_DEFAULT_EXTENSIONS = {
    "pdf": ".pdf",
    "ppt": ".pptx",
    "image": ".png",
    "video": ".mp4",
    "other": ".bin",
}

# 赛季导出规范只保存官方来源与版本；学生仍然决定正式条目的内容和组织方式。
ENGINEERING_NOTEBOOK_SEASON_SPECS = {
    "2026-2027": {
        "competition": "VEX IQ Robotics Competition",
        "game": "Level Up",
        "manualVersion": "0.2",
        "manualPublishedAt": "2026-06-04",
        "manualUrl": "https://content.vexrobotics.com/docs/2026-2027/level-up/files/levelup-v0.2.pdf",
        "rubricVersion": "2025-08-20",
        "rubricUrl": "https://kb.roboticseducation.org/hc/en-us/articles/4461349729047-Judging-Resource-Engineering-Notebook-Rubric",
    }
}


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
    phase: Literal["not_started", "theory", "building"] = "not_started"
    created_at: datetime

 
class Material(BaseModel):
    id: str
    title: str
    description: str = ""
    uploaded_by: str
    created_at: datetime
    updated_at: datetime

class MaterialStep(BaseModel):
    id: str
    material_id: str
    step_number: int
    step_type: Literal["lecture", "building", "discussion", "homework", "writing", "file_upload"]
    title: str
    content: str = ""
    attachment_url: str = ""
    attachment_name: str = ""
    created_at: datetime


class SessionMaterialAssignment(BaseModel):
    id: str
    class_session_id: str
    material_id: str
    assigned_to_type: Literal["class", "student"]
    assigned_to_student_id: Optional[str] = None
    assigned_by: str
    phase_tag: Literal["both", "theory", "building"] = "both"
    created_at: datetime


class MaterialViewRecord(BaseModel):
    id: str
    student_id: str
    material_id: str
    class_session_id: Optional[str] = None
    view_source: Literal["current_lesson", "review"]
    opened_at: datetime
    location_status: Literal["valid", "outside", "denied", "unavailable", "not_required", "not_configured"]
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class AttendanceRecord(BaseModel):
    id: str
    student_id: str
    class_session_id: str
    material_id: str
    checked_in_at: datetime
    method: Literal["auto_location"] = "auto_location"
    location_status: Literal["valid"] = "valid"
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    created_at: datetime


class LoginRequest(BaseModel):
    email: str
    password: str


class StudentCreateRequest(BaseModel):
    display_name: str
    email: str
    parent_name: str = ""
    password: str = ""


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


class AssignmentCreateRequest(BaseModel):
    material_id: str
    assigned_to_type: Literal["class", "student"] = "class"
    assigned_to_student_id: Optional[str] = None
    phase_tag: Literal["both", "theory", "building"] = "both"

class MaterialUpdateRequest(BaseModel):
    title: str
    description: str = ""

class MaterialStepCreateRequest(BaseModel):
    step_type: Literal["lecture", "building", "discussion", "homework", "writing", "file_upload"]
    title: str
    content: str = ""
    attachment_url: str = ""
    attachment_name: str = ""

class MaterialStepUpdateRequest(BaseModel):
    step_type: Literal["lecture", "building", "discussion", "homework", "writing", "file_upload"]
    title: str
    content: str = ""
    attachment_url: str = ""
    attachment_name: str = ""

class MaterialStepReorderRequest(BaseModel):
    step_ids: list[str]

class SessionUpdateRequest(BaseModel):
    status: Literal["completed", "cancelled"]

class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str


class EngineeringTeamCreateRequest(BaseModel):
    name: str
    team_number: str
    season: str


class EngineeringTeamUpdateRequest(BaseModel):
    name: str
    status: Literal["active", "archived"]


class EngineeringTeamMemberRequest(BaseModel):
    student_id: str
    role: Literal["member", "notebooker"] = "member"


class EngineeringNoteWriteRequest(BaseModel):
    team_id: str
    objective: str
    work_completed: str
    reasoning: str
    alternatives: str = ""
    test_evidence: str = ""
    outcome: str
    problems: str = ""
    resolution_status: Literal["no_problem", "resolved", "partially_resolved", "unresolved"]
    resolution: str = ""
    unresolved_reason: str = ""
    next_steps: str = ""


class EngineeringMergeProposalCreateRequest(EngineeringNoteWriteRequest):
    class_session_id: Optional[str] = None
    title: str
    source_note_ids: list[str] = Field(min_length=1)


class MaterialOpenRequest(BaseModel):
    source: Literal["current_lesson", "review"]
    class_session_id: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_permission: Literal["granted", "denied", "unavailable"] = "unavailable"


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
