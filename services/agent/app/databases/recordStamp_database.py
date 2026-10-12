from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4


def current_utc_time() -> datetime:
    return datetime.now(UTC)


def create_prefixed_id(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex[:12]}"
