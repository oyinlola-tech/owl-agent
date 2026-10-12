from __future__ import annotations

import argparse
import os
import socket
import sys
import threading

LOOPBACK_HOST = "127.0.0.1"
DEFAULT_PORT = 8000
EXIT_CODE_PORT_IN_USE = 3
DESKTOP_WEBVIEW_ORIGINS = (
    "tauri://localhost",
    "http://tauri.localhost",
    "https://tauri.localhost",
)


def find_service_data_dir(requested: str) -> str:
    if requested:
        os.environ["OWL_DATA_DIR"] = os.path.abspath(os.path.expanduser(requested))
    from app.settings.dataDirectory_setting import resolve_data_layout

    return resolve_data_layout().root


def read_command_line_options(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="owl-service", description="OWL agent service")
    parser.add_argument("--port", type=int, default=int(os.environ.get("OWL_PORT", DEFAULT_PORT)))
    parser.add_argument("--data-dir", default="")
    parser.add_argument("--exit-when-stdin-closes", action="store_true")
    return parser.parse_args(argv)


def is_port_already_taken(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        try:
            probe.bind((LOOPBACK_HOST, port))
        except OSError:
            return True
    return False


def merge_desktop_origins_into_trusted_origins() -> None:
    existing = [o.strip() for o in os.environ.get("OWL_TRUSTED_ORIGINS", "").split(",")]
    merged = [o for o in existing if o]
    for origin in DESKTOP_WEBVIEW_ORIGINS:
        if origin not in merged:
            merged.append(origin)
    os.environ["OWL_TRUSTED_ORIGINS"] = ",".join(merged)


def prepare_service_environment(data_dir: str) -> None:
    os.makedirs(data_dir, mode=0o700, exist_ok=True)
    os.chdir(data_dir)
    os.environ["OWL_DATA_DIR"] = data_dir
    merge_desktop_origins_into_trusted_origins()


def exit_when_parent_closes_stdin() -> None:
    stream = sys.stdin.buffer if sys.stdin else None
    if stream is None:
        return
    while stream.read(4096):
        pass
    os._exit(0)


def start_stdin_watcher_thread() -> None:
    watcher = threading.Thread(target=exit_when_parent_closes_stdin, daemon=True)
    watcher.start()


def load_create_app_function():
    try:
        from app import create_app
    except ImportError:
        from app.main import create_app
    return create_app


def run_service_until_stopped(argv: list[str]) -> int:
    options = read_command_line_options(argv)
    data_dir = find_service_data_dir(options.data_dir)
    if is_port_already_taken(options.port):
        print(f"owl-service: port {options.port} is already in use", file=sys.stderr)
        return EXIT_CODE_PORT_IN_USE
    prepare_service_environment(data_dir)
    if options.exit_when_stdin_closes:
        start_stdin_watcher_thread()

    import uvicorn

    print(f"owl-service: data dir {data_dir}", file=sys.stderr)
    uvicorn.run(
        load_create_app_function(),
        factory=True,
        # Security: bind to loopback only so the agent API is never reachable from the network.
        host=LOOPBACK_HOST,
        port=options.port,
        log_level=os.environ.get("OWL_LOG_LEVEL", "info").lower(),
    )
    return 0


if __name__ == "__main__":
    sys.exit(run_service_until_stopped(sys.argv[1:]))
