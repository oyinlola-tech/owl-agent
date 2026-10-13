export type DiffHunkLineKind = "context" | "add" | "del";

export interface DiffHunkLine {
  kind: DiffHunkLineKind;
  text: string;
  /** 1-based old-file line number, or null for additions. */
  oldLine: number | null;
  /** 1-based new-file line number, or null for deletions. */
  newLine: number | null;
}

export interface DiffHunk {
  index: number;
  /** Raw `@@ -a,b +c,d @@` header. */
  header: string;
  /** 1-based old-file start (0 when the hunk adds before line 1). */
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffHunkLine[];
}

const HUNK_HEADER_PATTERN = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

function splitLines(text: string): string[] {
  return text === "" ? [] : text.split("\n");
}

/**
 * Parse a unified diff into hunks. Skips file headers (`diff --git`,
 * `---`/`+++`), the `\ No newline at end of file` marker, and anything
 * outside a `@@` hunk. A truly empty line inside a hunk is treated as a
 * blank context line, matching unified-diff convention.
 */
export function parseUnifiedDiff(diffText: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  if (diffText === "") return hunks;
  const rawLines = diffText.split("\n");
  if (diffText.endsWith("\n")) rawLines.pop();

  let current: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;
  const closeHunk = () => {
    if (current) hunks.push(current);
    current = null;
  };

  for (const raw of rawLines) {
    const header = HUNK_HEADER_PATTERN.exec(raw);
    if (header) {
      closeHunk();
      const oldStart = Number(header[1]);
      const oldCount = header[2] === undefined ? 1 : Number(header[2]);
      const newStart = Number(header[3]);
      const newCount = header[4] === undefined ? 1 : Number(header[4]);
      current = {
        index: hunks.length,
        header: header[0],
        oldStart,
        oldCount,
        newStart,
        newCount,
        lines: [],
      };
      oldLine = oldStart === 0 ? 0 : oldStart;
      newLine = newStart === 0 ? 0 : newStart;
      continue;
    }
    if (!current) continue;
    if (raw.startsWith("\\")) continue;
    const marker = raw.charAt(0);
    if (marker === " " || raw === "") {
      current.lines.push({ kind: "context", text: raw === "" ? "" : raw.slice(1), oldLine: oldLine || null, newLine: newLine || null });
      if (oldLine > 0) oldLine += 1;
      if (newLine > 0) newLine += 1;
    } else if (marker === "+") {
      if (current.lines.length === 0 && raw.startsWith("+++")) continue;
      current.lines.push({ kind: "add", text: raw.slice(1), oldLine: null, newLine: newLine || null });
      if (newLine > 0) newLine += 1;
    } else if (marker === "-") {
      if (current.lines.length === 0 && raw.startsWith("---")) continue;
      current.lines.push({ kind: "del", text: raw.slice(1), oldLine: oldLine || null, newLine: null });
      if (oldLine > 0) oldLine += 1;
    }
  }
  closeHunk();
  return hunks;
}

type Opcode = { op: "eq" | "del" | "add"; oldIdx: number; newIdx: number };

function diffOpcodes(oldLines: string[], newLines: string[]): Opcode[] {
  const n = oldLines.length;
  const m = newLines.length;
  const table = new Uint32Array((n + 1) * (m + 1));
  const at = (i: number, j: number): number => table[i * (m + 1) + j];
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i * (m + 1) + j] = oldLines[i] === newLines[j]
        ? at(i + 1, j + 1) + 1
        : Math.max(at(i + 1, j), at(i, j + 1));
    }
  }
  const opcodes: Opcode[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (oldLines[i] === newLines[j]) {
      opcodes.push({ op: "eq", oldIdx: i, newIdx: j });
      i += 1;
      j += 1;
    } else if (at(i + 1, j) >= at(i, j + 1)) {
      opcodes.push({ op: "del", oldIdx: i, newIdx: j });
      i += 1;
    } else {
      opcodes.push({ op: "add", oldIdx: i, newIdx: j });
      j += 1;
    }
  }
  while (i < n) {
    opcodes.push({ op: "del", oldIdx: i, newIdx: j });
    i += 1;
  }
  while (j < m) {
    opcodes.push({ op: "add", oldIdx: i, newIdx: j });
    j += 1;
  }
  return opcodes;
}

/** Whole-file fallback hunk for inputs too large for the O(n*m) LCS table. */
function wholeFileDiff(oldLines: string[], newLines: string[]): string {
  const body: string[] = [];
  for (const line of oldLines) body.push(`-${line}`);
  for (const line of newLines) body.push(`+${line}`);
  return `@@ -${oldLines.length ? 1 : 0},${oldLines.length} +${newLines.length ? 1 : 0},${newLines.length} @@\n${body.join("\n")}`;
}

/**
 * Build unified-diff hunks describing how to get from `beforeText` to
 * `afterText`. Runs the result through {@link parseUnifiedDiff} so hunk
 * headers and line numbers follow one code path. Returns no hunks when the
 * texts are identical.
 */
export function buildHunksFromTexts(beforeText: string, afterText: string, contextLines = 3): DiffHunk[] {
  if (beforeText === afterText) return [];
  const oldLines = splitLines(beforeText);
  const newLines = splitLines(afterText);
  if (oldLines.length * newLines.length > 1_000_000) {
    return parseUnifiedDiff(wholeFileDiff(oldLines, newLines));
  }

  const opcodes = diffOpcodes(oldLines, newLines);
  const context = Math.max(0, contextLines);
  // Collect changed opcode indices, expanded by context on each side.
  const spans: [number, number][] = [];
  for (let k = 0; k < opcodes.length; k += 1) {
    if (opcodes[k].op === "eq") continue;
    const start = Math.max(0, k - context);
    const end = Math.min(opcodes.length, k + 1 + context);
    const last = spans[spans.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else spans.push([start, end]);
  }

  const out: string[] = [];
  for (const [start, end] of spans) {
    const slice = opcodes.slice(start, end);
    const oldIdxs = slice.filter((o) => o.op !== "add").map((o) => o.oldIdx);
    const newIdxs = slice.filter((o) => o.op !== "del").map((o) => o.newIdx);
    const oldCount = oldIdxs.length;
    const newCount = newIdxs.length;
    // Git convention: a zero-count hunk starts at the line it follows (0 for prepend).
    const oldStart = oldCount === 0 ? (oldIdxs.length ? oldIdxs[0] : slice[0].oldIdx) : oldIdxs[0] + 1;
    const newStart = newCount === 0 ? (newIdxs.length ? newIdxs[0] : slice[0].newIdx) : newIdxs[0] + 1;
    out.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`);
    for (const o of slice) {
      if (o.op === "eq") out.push(` ${oldLines[o.oldIdx]}`);
      else if (o.op === "del") out.push(`-${oldLines[o.oldIdx]}`);
      else out.push(`+${newLines[o.newIdx]}`);
    }
  }
  return parseUnifiedDiff(out.join("\n"));
}

function hunkOldOffset(hunk: DiffHunk): number {
  return hunk.oldCount === 0 ? hunk.oldStart : hunk.oldStart - 1;
}

function hunkOldLength(hunk: DiffHunk): number {
  return hunk.lines.filter((line) => line.kind !== "add").length;
}

/**
 * Compose the accepted file text by applying only the selected hunks to
 * `beforeText`. Unselected hunks keep the old lines. A missing selection
 * defaults to selected (all hunks checked by default). Selecting every hunk
 * reproduces the new text; selecting none reproduces `beforeText`, which is
 * why refusing everything is equivalent to rejecting.
 */
export function composeAcceptedText(beforeText: string, hunks: DiffHunk[], selected: readonly boolean[]): string {
  if (hunks.length === 0) return beforeText;
  const before = splitLines(beforeText);
  const out: string[] = [];
  let cursor = 0;
  for (let h = 0; h < hunks.length; h += 1) {
    const hunk = hunks[h];
    const start = Math.min(Math.max(hunkOldOffset(hunk), 0), before.length);
    cursor = Math.min(cursor, start);
    while (cursor < start) {
      out.push(before[cursor]);
      cursor += 1;
    }
    const accept = selected[h] ?? true;
    for (const line of hunk.lines) {
      if (accept ? line.kind !== "del" : line.kind !== "add") out.push(line.text);
    }
    cursor = Math.max(cursor, start + hunkOldLength(hunk));
  }
  while (cursor < before.length) {
    out.push(before[cursor]);
    cursor += 1;
  }
  return out.join("\n");
}
