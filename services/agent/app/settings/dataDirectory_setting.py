from __future__ import annotations

import os
import sys
from dataclasses import dataclass

import platformdirs

DATA_APP_NAME = "OWL"
LOWERCASE_DATA_APP_NAME = "owl"
LEGACY_APP_FOLDER = "owl-agent"
LEGACY_LAUNCHER_IDENTIFIER = "com.oyinlola.owl-agent"
DATABASE_FILE_NAME = "owl.db"
DATA_SUBFOLDERS = ("data", "screenshots", "backups", "logs", "exports")
DATA_DIRECTORY_ENVIRONMENT = "OWL_DATA_DIR"


@dataclass(frozen=True)
class DataLayout:
    root: str
    database_path: str
    cache_dir: str
    overridden: bool
    database_path_explicit: bool

    @property
    def data_dir(self) -> str:
        return os.path.join(self.root, "data")

    @property
    def screenshots_dir(self) -> str:
        return os.path.join(self.root, "screenshots")

    @property
    def backups_dir(self) -> str:
        return os.path.join(self.root, "backups")

    @property
    def logs_dir(self) -> str:
        return os.path.join(self.root, "logs")

    @property
    def exports_dir(self) -> str:
        return os.path.join(self.root, "exports")

    def list_private_folders(self) -> list[str]:
        folders = [self.root, *(os.path.join(self.root, name) for name in DATA_SUBFOLDERS)]
        if self.database_path != ":memory:":
            folders.append(os.path.dirname(os.path.abspath(self.database_path)))
        folders.append(self.cache_dir)
        return list(dict.fromkeys(folders))


def pick_platform_app_name() -> str:
    if sys.platform in ("win32", "darwin"):
        return DATA_APP_NAME
    return LOWERCASE_DATA_APP_NAME


def find_default_data_root() -> str:
    return platformdirs.user_data_dir(pick_platform_app_name(), appauthor=False, roaming=True)


def find_default_cache_root() -> str:
    return platformdirs.user_cache_dir(pick_platform_app_name(), appauthor=False)


def find_legacy_xdg_database_path() -> str:
    base = os.environ.get("XDG_DATA_HOME") or os.path.join(
        os.path.expanduser("~"), ".local", "share"
    )
    return os.path.join(base, LEGACY_APP_FOLDER, DATABASE_FILE_NAME)


def find_legacy_launcher_database_path() -> str:
    home = os.path.expanduser("~")
    if sys.platform == "win32":
        base = os.environ.get("APPDATA") or os.path.join(home, "AppData", "Roaming")
    elif sys.platform == "darwin":
        base = os.path.join(home, "Library", "Application Support")
    else:
        base = os.environ.get("XDG_DATA_HOME") or os.path.join(home, ".local", "share")
    return os.path.join(base, LEGACY_LAUNCHER_IDENTIFIER, DATABASE_FILE_NAME)


def resolve_data_layout(data_dir: str = "", db_path: str = "") -> DataLayout:
    explicit_root = (data_dir or os.environ.get(DATA_DIRECTORY_ENVIRONMENT, "")).strip()
    db_path = (db_path or "").strip()
    if explicit_root:
        root = os.path.abspath(os.path.expanduser(explicit_root))
        overridden = True
    elif db_path and db_path != ":memory:":
        root = os.path.dirname(os.path.abspath(os.path.expanduser(db_path)))
        overridden = True
    else:
        root = find_default_data_root()
        overridden = False
    if db_path:
        database_path = db_path if db_path == ":memory:" else os.path.abspath(db_path)
    else:
        database_path = os.path.join(root, "data", DATABASE_FILE_NAME)
    cache_dir = os.path.join(root, "cache") if overridden else find_default_cache_root()
    return DataLayout(
        root=root,
        database_path=database_path,
        cache_dir=cache_dir,
        overridden=overridden,
        database_path_explicit=bool(db_path),
    )


def list_legacy_database_candidates(layout: DataLayout) -> list[str]:
    if layout.database_path_explicit:
        return []
    candidates = [os.path.join(layout.root, DATABASE_FILE_NAME)]
    if not layout.overridden:
        candidates += [find_legacy_xdg_database_path(), find_legacy_launcher_database_path()]
    target = os.path.abspath(layout.database_path)
    return [c for c in dict.fromkeys(candidates) if os.path.abspath(c) != target]
