"""Utility functions."""
import re
from datetime import date, datetime, timedelta, timezone
from math import asin, cos, radians, sin, sqrt
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile

from .config import get_settings
from .models import MATERIAL_ALLOWED_EXTENSIONS, MATERIAL_DEFAULT_EXTENSIONS, MATERIAL_DIRECTORY_MAP

settings = get_settings()

WEEKDAY_LABELS = [
    "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
]


def parse_datetime_value(raw) -> datetime:
    if isinstance(raw, datetime):
        return raw
    return datetime.fromisoformat(raw)


def parse_date_value(raw) -> date:
    if isinstance(raw, date):
        return raw
    return date.fromisoformat(raw)


def parse_time_value(raw: str) -> str:
    """Validate and normalize a time string like '10:00'."""
    import re
    if not re.match(r'^\d{2}:\d{2}$', raw.strip()):
        raise HTTPException(status_code=422, detail=f"Invalid time format: {raw}. Expected HH:MM.")
    return raw.strip()


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def make_id(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex[:10]}"


def slugify_filename_part(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", value.strip().lower())
    return normalized.strip("-") or "material"


def material_storage_path(relative_path: str) -> Path:
    return settings.materials_storage_dir / relative_path


def material_download_url(material_id: str) -> str:
    return f"/api/materials/{material_id}/download"


def material_storage_label(relative_path: str) -> str:
    return f"/{relative_path.lstrip('/')}"


def resolve_material_extension(file_type: str, upload: UploadFile) -> str:
    original_name = upload.filename or ""
    extension = Path(original_name).suffix.lower()
    allowed_extensions = MATERIAL_ALLOWED_EXTENSIONS[file_type]

    if extension:
        if allowed_extensions and extension not in allowed_extensions:
            raise HTTPException(
                status_code=422,
                detail=f"Uploaded file does not match the selected {file_type} material type.",
            )
        return extension

    return MATERIAL_DEFAULT_EXTENSIONS[file_type]


async def store_material_file(material_id: str, file_type: str, title: str, upload: UploadFile) -> tuple[str, int]:
    extension = resolve_material_extension(file_type, upload)
    directory = settings.materials_storage_dir / MATERIAL_DIRECTORY_MAP[file_type]
    directory.mkdir(parents=True, exist_ok=True)

    filename = f"{slugify_filename_part(title)[:40]}-{material_id}{extension}"
    destination = directory / filename
    content = await upload.read()
    if not content:
        raise HTTPException(status_code=422, detail="Uploaded file is empty.")

    destination.write_bytes(content)
    relative_path = destination.relative_to(settings.materials_storage_dir).as_posix()
    return relative_path, len(content)


def first_weekday_on_or_after(start: date, weekday: int) -> date:
    """Return the first date on or after `start` matching the given weekday (0=Monday)."""
    current = start
    while current.weekday() != weekday:
        current += timedelta(days=1)
    return current


def combine_session_datetime(session_date: date, time_str: str) -> datetime:
    """Interpret class wall-clock time in the server local timezone."""
    from datetime import time
    hour, minute = map(int, time_str.strip().split(":"))
    local_timezone = datetime.now().astimezone().tzinfo or timezone.utc
    return datetime.combine(session_date, time(hour, minute), tzinfo=local_timezone)


def is_session_active(session, current_time: datetime) -> bool:
    """Check if the current time falls within the session window."""
    return session.start_datetime <= current_time <= session.end_datetime


def haversine_distance_meters(
    latitude_a: float,
    longitude_a: float,
    latitude_b: float,
    longitude_b: float,
) -> float:
    earth_radius_meters = 6_371_000
    lat_a = radians(latitude_a)
    lon_a = radians(longitude_a)
    lat_b = radians(latitude_b)
    lon_b = radians(longitude_b)
    delta_lat = lat_b - lat_a
    delta_lon = lon_b - lon_a
    term = sin(delta_lat / 2) ** 2 + cos(lat_a) * cos(lat_b) * sin(delta_lon / 2) ** 2
    return 2 * earth_radius_meters * asin(sqrt(term))


def resolve_location_status(request) -> str:
    if request.source == "review":
        return "not_required"
    if request.location_permission == "denied":
        return "denied"
    if request.location_permission == "unavailable":
        return "unavailable"
    if request.latitude is None or request.longitude is None:
        return "unavailable"
    if not settings.is_attendance_location_configured:
        return "not_configured"
    distance = haversine_distance_meters(
        request.latitude,
        request.longitude,
        settings.classroom_latitude,
        settings.classroom_longitude,
    )
    return "valid" if distance <= settings.allowed_radius_meters else "outside"
