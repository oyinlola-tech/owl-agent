#!/usr/bin/env python3
import json
import os
import sys
import urllib.request

BASE = os.environ.get("OWL_BASE_URL", "http://127.0.0.1:8000")


def call_service(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        BASE + path,
        data=data,
        method=method,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as res:
            return res.status, res.read().decode()
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode()


def run_live_checks():
    if not os.environ.get("NVIDIA_API_KEY"):
        print("REFUSED: NVIDIA_API_KEY is not set. Nothing was called.")
        return 2
    failures = []

    def record_step(name, cond, detail=""):
        print(
            ("PASS " if cond else "FAIL ") + name + (f" — {detail}" if detail and not cond else "")
        )
        if not cond:
            failures.append(name)

    status, body = call_service("GET", "/provider")
    info = json.loads(body) if status == 200 else {}
    record_step("provider endpoint", status == 200, body[:120])
    record_step("key configured server-side", info.get("configured") is True)
    record_step("no key material exposed", "nvapi-" not in body and "API_KEY" not in body.upper())

    status, body = call_service("POST", "/provider/verify")
    verdict = json.loads(body) if status == 200 else {}
    record_step("verify ok", verdict.get("ok") is True, body[:200])

    status, body = call_service(
        "POST",
        "/chat",
        {
            "messages": [
                {"role": "user", "content": "What is 2+2?"},
                {"role": "assistant", "content": "4."},
                {"role": "user", "content": 'And 3+3? Reply with ONLY JSON: {"answer": <n>}.'},
            ]
        },
    )
    reply = json.loads(body) if status == 200 else {}
    record_step("chat reply", status == 200 and "answer" in reply.get("reply", ""), body[:200])
    record_step("usage reported", isinstance(reply.get("usage"), dict))

    status, body = call_service(
        "POST",
        "/chat/stream",
        {"messages": [{"role": "user", "content": "Say hi in five words."}]},
    )
    record_step(
        "chat stream",
        status == 200 and "chat.delta" in body and "chat.done" in body,
        body[:120],
    )

    print("LIVE RESULT:", "PASS" if not failures else f"FAIL ({len(failures)})")
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(run_live_checks())
