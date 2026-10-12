from __future__ import annotations

from functools import lru_cache

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

DEVELOPMENT_ORIGINS = [
    "http://localhost:1420",
    "http://127.0.0.1:1420",
    "tauri://localhost",
    "http://tauri.localhost",
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

    nvidia_api_key: str = Field(
        default="", validation_alias=AliasChoices("NVIDIA_API_KEY", "OWL_NVIDIA_API_KEY")
    )
    nvidia_base_url: str = Field(
        default="https://integrate.api.nvidia.com/v1",
        validation_alias=AliasChoices("NVIDIA_BASE_URL", "OWL_NVIDIA_BASE_URL"),
    )
    nvidia_model: str = Field(
        default="nvidia/llama-3.1-nemotron-70b-instruct",
        validation_alias=AliasChoices("NVIDIA_MODEL", "OWL_NVIDIA_MODEL"),
    )
    nvidia_timeout: float = Field(
        default=60.0, validation_alias=AliasChoices("NVIDIA_TIMEOUT", "OWL_NVIDIA_TIMEOUT")
    )
    nvidia_max_tokens: int = Field(
        default=1024, validation_alias=AliasChoices("NVIDIA_MAX_TOKENS", "OWL_NVIDIA_MAX_TOKENS")
    )
    nvidia_temperature: float = Field(
        default=0.7,
        validation_alias=AliasChoices("NVIDIA_TEMPERATURE", "OWL_NVIDIA_TEMPERATURE"),
    )
    provider: str = ""
    secret_store: str = "auto"
    anthropic_base_url: str = ""
    provider_timeout: float = 120.0
    provider_max_tokens: int = 4096
    db_path: str = ""
    data_dir: str = ""
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
    max_verification_attempts: int = 3
    verify_timeout: float = 600.0

    service_token: str = ""
    service_token_file: str = ""
    require_token: bool = False
    dev_token: str = ""
    allowed_hosts: str = ""
    sandbox: str = "preferred"
    sandbox_backend: str = "auto"
    sandbox_image: str = "python:3.12-slim"
    sandbox_readonly_paths: str = ""
    sandbox_cache_paths: str = "~/.cargo/registry,~/.npm,~/.cache/pip,~/.m2,~/.gradle"
    sandbox_max_processes: int = 256
    sandbox_cpu_seconds: int = 900
    sandbox_memory_mb: int = 16384
    sandbox_open_files: int = 4096
    verify_network: bool = False
    browser_allow_loopback: bool = False

    @property
    def allowed_cors_origins(self) -> list[str]:
        seen = list(DEVELOPMENT_ORIGINS)
        for origin in self.trusted_origins.split(","):
            origin = origin.strip()
            if origin and origin not in seen:
                seen.append(origin)
        return seen


@lru_cache
def load_settings_once() -> Settings:
    return Settings()


def describe_secret_presence(value: str) -> str:
    # Security: never expose secret material in logs or errors, only whether it is set.
    if not value:
        return ""
    return "set" if len(value) > 0 else ""
