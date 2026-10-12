from __future__ import annotations

import json
import logging
import os
import threading

KEYRING_SERVICE = "owl-agent"
KEY_FILE_NAME = "provider-keys.json"
SECRET_STORE_MODES = ("auto", "keyring", "file")

log = logging.getLogger("owl")


def build_key_hint(key: str) -> str:
    # Security: the hint shows at most the last four characters, and only for keys long
    # enough that four characters can't meaningfully narrow a brute-force search.
    return f"…{key[-4:]}" if len(key) >= 12 else "…"


def redact_key_values(text: str, keys: list[str] | set[str]) -> str:
    for key in sorted((k for k in keys if k and len(k) >= 6), key=len, reverse=True):
        text = text.replace(key, "[redacted-key]")
    return text


class ProviderKeyStore:
    def __init__(self, data_dir: str, mode: str = "auto") -> None:
        self.data_dir = data_dir
        self.mode = mode if mode in SECRET_STORE_MODES else "auto"
        self.file_path = os.path.join(data_dir, KEY_FILE_NAME)
        self._lock = threading.Lock()
        self._keyring_ok: bool | None = None
        self._seen: set[str] = set()

    def is_keyring_available(self) -> bool:
        if self.mode == "file":
            return False
        if self._keyring_ok is None:
            self._keyring_ok = self.probe_keyring_backend()
        return self._keyring_ok

    @staticmethod
    def probe_keyring_backend() -> bool:
        try:
            import keyring
            from keyring.backends import fail

            backend = keyring.get_keyring()
            if isinstance(backend, fail.Keyring):
                return False
            if hasattr(backend, "backends") and not backend.backends:
                return False
            return float(getattr(backend, "priority", 0)) > 0
        except Exception:  # noqa: BLE001 - any keyring failure means "no keyring"
            return False

    def describe_storage(self) -> dict[str, str]:
        if self.is_keyring_available():
            return {
                "backend": "keyring",
                "detail": "Keys are stored in your system keychain (service owl-agent).",
            }
        return {
            "backend": "file",
            "detail": (
                "No system keychain is available, so keys are stored in a private file "
                "(readable only by you) in OWL's data folder."
            ),
        }

    def save_key(self, provider_id: str, key: str) -> str:
        self._seen.add(key)
        if self.is_keyring_available():
            try:
                import keyring

                keyring.set_password(KEYRING_SERVICE, provider_id, key)
                self.remove_from_file(provider_id)
                return "keyring"
            except Exception as exc:  # noqa: BLE001 - fall back to the private file
                log.warning("keyring write failed (%s); using the key file", type(exc).__name__)
                if self.mode == "keyring":
                    raise
        self.write_file_entry(provider_id, key)
        return "file"

    def read_key(self, provider_id: str, source: str = "") -> str:
        key = ""
        if source != "file" and self.is_keyring_available():
            try:
                import keyring

                key = keyring.get_password(KEYRING_SERVICE, provider_id) or ""
            except Exception as exc:  # noqa: BLE001 - treat as missing
                log.warning("keyring read failed (%s)", type(exc).__name__)
        if not key:
            key = str(self.read_file_entries().get(provider_id, ""))
        if key:
            self._seen.add(key)
        return key

    def delete_key(self, provider_id: str) -> None:
        if self.is_keyring_available():
            try:
                import keyring

                keyring.delete_password(KEYRING_SERVICE, provider_id)
            except Exception:  # noqa: BLE001 - nothing stored there
                pass
        self.remove_from_file(provider_id)

    def remember_secret_for_redaction(self, value: str) -> None:
        if value:
            self._seen.add(value)

    def redact(self, text: str) -> str:
        return redact_key_values(text, self._seen)

    def read_file_entries(self) -> dict:
        try:
            with open(self.file_path, encoding="utf-8") as fh:
                data = json.load(fh)
        except (OSError, ValueError):
            return {}
        return data if isinstance(data, dict) else {}

    def write_file_entry(self, provider_id: str, key: str) -> None:
        with self._lock:
            data = self.read_file_entries()
            data[provider_id] = key
            self.write_file_entries(data)

    def remove_from_file(self, provider_id: str) -> None:
        with self._lock:
            data = self.read_file_entries()
            if provider_id in data:
                data.pop(provider_id)
                self.write_file_entries(data)

    def write_file_entries(self, data: dict) -> None:
        # Security: the fallback key file is created 0600 before any key is written to it.
        os.makedirs(self.data_dir, mode=0o700, exist_ok=True)
        temp = self.file_path + ".tmp"
        fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        try:
            if os.name == "posix":
                os.fchmod(fd, 0o600)
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                json.dump(data, fh)
        except Exception:
            if os.path.exists(temp):
                os.unlink(temp)
            raise
        os.replace(temp, self.file_path)
