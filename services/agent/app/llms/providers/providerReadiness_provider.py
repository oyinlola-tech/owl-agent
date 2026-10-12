from __future__ import annotations


def is_provider_ready(provider: object) -> bool:
    describe = getattr(provider, "describe", None)
    if not callable(describe):
        return False
    return bool(describe().get("configured"))
