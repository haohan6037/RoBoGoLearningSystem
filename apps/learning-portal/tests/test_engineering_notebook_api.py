#!/usr/bin/env python3
"""Competition team and Engineering Record public API integration tests."""

import os
import tempfile
from pathlib import Path

TEMP_DIR = tempfile.TemporaryDirectory(prefix="robogo-competition-")
os.environ["ROBOGO_DATABASE_PROVIDER"] = "sqlite"
os.environ["ROBOGO_SQLITE_PATH"] = str(Path(TEMP_DIR.name) / "competition.sqlite3")
os.environ["ROBOGO_MATERIALS_STORAGE_ROOT"] = str(Path(TEMP_DIR.name) / "materials")

APP_DIR = Path(__file__).resolve().parents[1]
import sys
sys.path.insert(0, str(APP_DIR))

from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)


def login(email: str, password: str) -> dict[str, str]:
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['token']}"}


def record_payload(team_id: str, suffix: str = "") -> dict[str, str]:
    return {
        "team_id": team_id,
        "objective": f"Improve intake reliability{suffix}",
        "work_completed": "Changed roller spacing and ran ten trials.",
        "reasoning": "The previous spacing compressed game objects.",
        "alternatives": "Keep the old spacing; use softer rollers.",
        "test_evidence": "Nine of ten objects were collected without a jam.",
        "outcome": "Reliability improved from six to nine successful trials.",
        "problems": "One object still entered at an angle.",
        "resolution_status": "unresolved",
        "resolution": "",
        "unresolved_reason": "We need a side guide prototype.",
        "next_steps": "Build and test a side guide next time.",
    }


def create_team(teacher: dict[str, str], number: str, season: str) -> dict:
    response = client.post(
        "/api/teacher/engineering-teams",
        headers=teacher,
        json={"name": number, "team_number": number, "season": season},
    )
    assert response.status_code == 200, response.text
    return response.json()["team"]


def demo_student_id(teacher: dict[str, str]) -> str:
    return client.get("/api/teacher/students", headers=teacher).json()["students"][0]["id"]


def add_member(teacher: dict[str, str], team_id: str, student_id: str):
    response = client.post(
        f"/api/teacher/engineering-teams/{team_id}/members",
        headers=teacher,
        json={"student_id": student_id},
    )
    assert response.status_code == 200, response.text


def test_competition_member_can_create_multiple_records_without_a_class_session() -> None:
    teacher = login("teacher@robogo.local", "Teacher123!")
    student = login("student@robogo.local", "Student123!")
    team = create_team(teacher, "IQ-FREE", "2028-2029")
    add_member(teacher, team["id"], demo_student_id(teacher))

    first = client.post("/api/student/engineering-notes", headers=student, json=record_payload(team["id"], " — first"))
    second = client.post("/api/student/engineering-notes", headers=student, json=record_payload(team["id"], " — second"))
    assert first.status_code == second.status_code == 200
    assert first.json()["note"]["id"] != second.json()["note"]["id"]
    assert first.json()["note"]["classSessionId"] is None
    notes = client.get("/api/student/engineering-notebook", headers=student).json()["notes"]
    assert len([item for item in notes if item["teamId"] == team["id"]]) == 2


def test_teacher_manages_teams_and_former_members_keep_read_only_history() -> None:
    teacher = login("teacher@robogo.local", "Teacher123!")
    student = login("student@robogo.local", "Student123!")
    student_id = demo_student_id(teacher)
    first = create_team(teacher, "IQ-MANAGE-A", "2029-2030")
    second = create_team(teacher, "IQ-MANAGE-B", "2029-2030")
    add_member(teacher, first["id"], student_id)
    conflict = client.post(f"/api/teacher/engineering-teams/{second['id']}/members", headers=teacher, json={"student_id": student_id})
    assert conflict.status_code == 409

    updated = client.put(f"/api/teacher/engineering-teams/{first['id']}", headers=teacher, json={"name": "Renamed Team", "status": "active"})
    assert updated.status_code == 200
    assert updated.json()["team"]["teamNumber"] == "IQ-MANAGE-A"
    record = client.post("/api/student/engineering-notes", headers=student, json=record_payload(first["id"])).json()["note"]
    assert client.delete(f"/api/teacher/engineering-teams/{first['id']}/members/{student_id}", headers=teacher).status_code == 200
    historical = next(item for item in client.get("/api/student/engineering-notebook", headers=student).json()["notes"] if item["id"] == record["id"])
    assert historical["canEdit"] is False
    blocked = client.put(f"/api/student/engineering-notes/{record['id']}", headers=student, json=record_payload(first["id"], " changed"))
    assert blocked.status_code == 403
    add_member(teacher, second["id"], student_id)


def test_discarded_records_are_recoverable_and_excluded_from_team_pdf() -> None:
    teacher = login("teacher@robogo.local", "Teacher123!")
    student = login("student@robogo.local", "Student123!")
    team = create_team(teacher, "IQ-PDF", "2030-2031")
    add_member(teacher, team["id"], demo_student_id(teacher))
    client.post("/api/student/engineering-notes", headers=student, json=record_payload(team["id"], " — KEEP THIS RECORD"))
    discarded = client.post("/api/student/engineering-notes", headers=student, json=record_payload(team["id"], " — HIDE THIS RECORD")).json()["note"]
    response = client.put(f"/api/student/engineering-notes/{discarded['id']}/status?status=discarded", headers=student)
    assert response.status_code == 200 and response.json()["note"]["status"] == "discarded"

    import fitz
    pdf_response = client.get(f"/api/engineering-teams/{team['id']}/notebook.pdf", headers=student)
    pdf = fitz.open(stream=pdf_response.content, filetype="pdf")
    text = "\n".join(page.get_text() for page in pdf)
    assert "KEEP THIS RECORD" in text and "HIDE THIS RECORD" not in text
    restored = client.put(f"/api/student/engineering-notes/{discarded['id']}/status?status=active", headers=student)
    assert restored.status_code == 200 and restored.json()["note"]["status"] == "active"


if __name__ == "__main__":
    test_competition_member_can_create_multiple_records_without_a_class_session()
    test_teacher_manages_teams_and_former_members_keep_read_only_history()
    test_discarded_records_are_recoverable_and_excluded_from_team_pdf()
    print("PASS: Competition team members can write multiple independent records without classes")
    print("PASS: team management, history permissions, discard/restore, and PDF aggregation")
