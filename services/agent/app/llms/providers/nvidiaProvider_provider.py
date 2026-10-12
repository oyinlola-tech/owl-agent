from __future__ import annotations

import httpx

from ...settings.serviceSettings_setting import Settings
from ..adapters.openaiCompatible_adapter import OpenAICompatibleProvider

DEFAULT_NVIDIA_MODEL = "nvidia/llama-3.1-nemotron-70b-instruct"


class NvidiaProvider(OpenAICompatibleProvider):
    def __init__(
        self,
        settings: Settings,
        transport: httpx.AsyncBaseTransport | None = None,
        *,
        api_key: str | None = None,
        model: str = "",
    ) -> None:
        super().__init__(
            provider_id="nvidia",
            label="NVIDIA",
            base_url=settings.nvidia_base_url,
            api_key=settings.nvidia_api_key if api_key is None else api_key,
            model=model or settings.nvidia_model or DEFAULT_NVIDIA_MODEL,
            timeout=settings.nvidia_timeout,
            max_tokens=settings.nvidia_max_tokens,
            temperature=settings.nvidia_temperature,
            transport=transport,
        )
