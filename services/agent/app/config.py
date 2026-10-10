"""Central configuration. Secrets come from the environment only."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_ORIGINS = [
    "http://localhost:1420",
    "http://127.0.0.1:1420",
    "tauri://localhost",
]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="OWL_", extra="ignore")

    app_name: str = "owl-agent-service"
    version: str = "0.1.0"
    host: str = "127.0.0.1"
    port: int = 8000
    log_level: str = "info"
    trusted_origins: str = ""
    max_body_bytes: int = 262144
    step_delay: float = 1.0

    nvidia_api_key: str = ""
    nvidia_base_url: str = "https://integrate.api.nvidia.com/v1"
    nvidia_model: str = "nvidia/llama-3.1-nemotron-70b-instruct"
    nvidia_timeout: float = 60.0
    nvidia_max_tokens: int = 1024
    nvidia_temperature: float = 0.7
    db_path: str = ""
    router_default_model: str = ""
    router_fallback_model: str = ""
    router_allow_fallback: bool = True
    context_budget: float = 0.8
    context_reserve: float = 0.25
    max_retries: int = 2
    memory_retention: int = 200
    workspaces: str = ""
    exec_timeout: float = 120.0
    exec_output_limit: int = 65536
    approval_ttl: float = 1800.0
    max_iterations: int = 25
    max_model_calls: int = 40
    max_elapsed: float = 1800.0

    @property
    def cors_origins(self) -> list[str]:
        seen = list(DEV_ORIGINS)
        for origin in self.trusted_origins.split(","):
            origin = origin.strip()
            if origin and origin not in seen:
                seen.append(origin)
        return seen


@lru_cache
def get_settings() -> Settings:
    return Settings()


def redact(value: str) -> str:
    """Never expose secret material in logs or errors."""
    if not value:
        return ""
    return "set" if len(value) > 0 else ""
