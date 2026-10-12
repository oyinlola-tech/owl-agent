from __future__ import annotations

from ...settings.serviceSettings_setting import Settings
from .baseProvider_provider import ModelProvider
from .mockProvider_provider import MockProvider
from .nvidiaProvider_provider import NvidiaProvider


def build_provider_from_settings(settings: Settings) -> ModelProvider:
    if settings.nvidia_api_key:
        return NvidiaProvider(settings)
    return MockProvider()
