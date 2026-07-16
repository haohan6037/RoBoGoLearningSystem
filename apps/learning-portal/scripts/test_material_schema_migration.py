#!/usr/bin/env python3
"""Regression check for removing legacy material file columns without data loss."""

import os
import sqlite3
import sys
import tempfile
from pathlib import Path


with tempfile.TemporaryDirectory(prefix="robogo-material-migration-") as temp_dir:
    database_path = Path(temp_dir) / "legacy.sqlite3"
    os.environ["ROBOGO_DATABASE_PROVIDER"] = "sqlite"
    os.environ["ROBOGO_SQLITE_PATH"] = str(database_path)

    backend_dir = Path(__file__).resolve().parents[1] / "backend"
    sys.path.insert(0, str(backend_dir))

    from app.database import _migrate_remove_legacy_material_columns

    with sqlite3.connect(database_path) as connection:
        connection.execute(
            """
            CREATE TABLE materials (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                file_type TEXT NOT NULL,
                file_url TEXT NOT NULL,
                file_size INTEGER NOT NULL DEFAULT 0,
                uploaded_by TEXT NOT NULL,
                created_at TEXT NOT NULL,
                is_deleted INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT
            )
            """
        )
        connection.execute(
            """
            INSERT INTO materials (
                id, title, description, file_type, file_url, file_size,
                uploaded_by, created_at, is_deleted, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "material-legacy",
                "Legacy material",
                "Keep this record",
                "pdf",
                "/legacy/material.pdf",
                1024,
                "teacher-1",
                "2026-07-14T00:00:00+00:00",
                0,
                "2026-07-14T00:00:00+00:00",
            ),
        )

    _migrate_remove_legacy_material_columns()

    with sqlite3.connect(database_path) as connection:
        columns = {row[1] for row in connection.execute("PRAGMA table_info(materials)")}
        record = connection.execute(
            "SELECT id, title, description, uploaded_by, created_at, updated_at FROM materials"
        ).fetchone()

    legacy_columns = {"file_type", "file_url", "file_size", "is_deleted"}
    assert columns.isdisjoint(legacy_columns), f"legacy columns remain: {columns & legacy_columns}"
    assert record == (
        "material-legacy",
        "Legacy material",
        "Keep this record",
        "teacher-1",
        "2026-07-14T00:00:00+00:00",
        "2026-07-14T00:00:00+00:00",
    )

print("PASS: legacy material columns removed and material data preserved")
