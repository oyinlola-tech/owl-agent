from __future__ import annotations

from ..stackCatalog_stack import StackEntry
from .backendStacks_catalog import BACKEND_STACKS
from .dataStacks_catalog import DATA_STACKS
from .mobileStacks_catalog import MOBILE_STACKS
from .systemsStacks_catalog import SYSTEMS_STACKS
from .webStacks_catalog import WEB_STACKS


def collect_all_stacks() -> list[StackEntry]:
    return [
        *WEB_STACKS,
        *BACKEND_STACKS,
        *MOBILE_STACKS,
        *SYSTEMS_STACKS,
        *DATA_STACKS,
    ]
