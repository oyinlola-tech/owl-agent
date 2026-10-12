from __future__ import annotations

import io

from ..documentResult_document import MAX_SHEET_COLS, MAX_SHEET_ROWS, library_unavailable_result


def extract_sheet_lines(worksheet) -> tuple[list[str], int, int, bool]:
    lines = [f"# {worksheet.title}"]
    row_count = 0
    col_count = 0
    truncated = False
    for row in worksheet.iter_rows(values_only=True):
        if row_count >= MAX_SHEET_ROWS:
            truncated = True
            break
        if len(row) > MAX_SHEET_COLS:
            truncated = True
        cells = row[:MAX_SHEET_COLS]
        col_count = max(col_count, len(cells))
        lines.append("\t".join("" if cell is None else str(cell) for cell in cells))
        row_count += 1
    return lines, row_count, col_count, truncated


def extract_workbook(data: bytes, max_chars: int) -> dict:
    try:
        import openpyxl
    except ImportError:
        return library_unavailable_result("xlsx", "openpyxl")
    workbook = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    sheets = []
    chunks: list[str] = []
    truncated = False
    try:
        for worksheet in workbook.worksheets:
            lines, rows, cols, sheet_truncated = extract_sheet_lines(worksheet)
            truncated = truncated or sheet_truncated
            sheets.append({"name": worksheet.title, "rows": rows, "cols": cols})
            chunks.append("\n".join(lines))
            if sum(len(chunk) for chunk in chunks) > max_chars:
                truncated = True
                break
    finally:
        workbook.close()
    body = "\n\n".join(chunks)
    if len(body) > max_chars:
        body = body[:max_chars]
        truncated = True
    return {
        "type": "xlsx",
        "text": body,
        "structure": {"kind": "xlsx", "sheets": sheets},
        "truncated": truncated,
    }
