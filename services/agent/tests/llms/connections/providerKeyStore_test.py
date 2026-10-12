import os
import stat

from supports.providerDouble_support import SECRET_KEY, install_memory_keyring

from app.llms.connections.providerKey_connection import (
    KEYRING_SERVICE,
    ProviderKeyStore,
    build_key_hint,
)


def test_keyring_is_used_when_available(tmp_path, monkeypatch):
    backend = install_memory_keyring(monkeypatch)
    store = ProviderKeyStore(str(tmp_path), "auto")
    assert store.save_key("openai", SECRET_KEY) == "keyring"
    assert backend.store[(KEYRING_SERVICE, "openai")] == SECRET_KEY
    assert not os.path.exists(store.file_path) or "openai" not in store.read_file_entries()
    assert store.read_key("openai", "keyring") == SECRET_KEY
    store.delete_key("openai")
    assert (KEYRING_SERVICE, "openai") not in backend.store
    assert store.describe_storage()["backend"] == "keyring"


def test_file_fallback_is_private(tmp_path, monkeypatch):
    install_memory_keyring(monkeypatch)
    store = ProviderKeyStore(str(tmp_path), "file")
    assert store.save_key("groq", SECRET_KEY) == "file"
    assert store.read_key("groq", "file") == SECRET_KEY
    if os.name == "posix":
        assert stat.S_IMODE(os.stat(store.file_path).st_mode) == 0o600
    store.delete_key("groq")
    assert store.read_key("groq", "file") == ""
    assert store.describe_storage()["backend"] == "file"


def test_failed_keyring_write_falls_back_to_file(tmp_path, monkeypatch):
    backend = install_memory_keyring(monkeypatch)

    def refuse(*args):
        raise RuntimeError("locked")

    monkeypatch.setattr(backend, "set_password", refuse)
    store = ProviderKeyStore(str(tmp_path), "auto")
    assert store.save_key("xai", SECRET_KEY) == "file"
    assert store.read_key("xai", "file") == SECRET_KEY


def test_hint_and_redaction():
    assert build_key_hint(SECRET_KEY) == "…cdef"
    assert build_key_hint("short") == "…"
    store = ProviderKeyStore("/nonexistent", "file")
    store.remember_secret_for_redaction(SECRET_KEY)
    assert SECRET_KEY not in store.redact(f"echo {SECRET_KEY} back")
