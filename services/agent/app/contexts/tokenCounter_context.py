from __future__ import annotations


def build_token_counter():
    try:
        import tiktoken  # type: ignore[import-not-found]

        enc = tiktoken.get_encoding("cl100k_base")

        def count_with_tiktoken(text: str) -> tuple[int, str]:
            return len(enc.encode(text)), "tiktoken-cl100k"

        return count_with_tiktoken
    except Exception:  # noqa: BLE001 - tokenizer is best-effort

        def estimate_from_characters(text: str) -> tuple[int, str]:
            return max(1, len(text) // 4), "chars/4-estimate"

        return estimate_from_characters


count_tokens = build_token_counter()
