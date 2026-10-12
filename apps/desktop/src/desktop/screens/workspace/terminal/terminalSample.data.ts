import { Globe, TerminalWindow, TestTube } from "@phosphor-icons/react";

type SampleTerminalLine = { kind: "cmd" | "out" | "ok" | "err" | "agent"; text: string };

export const SAMPLE_DEV_SERVER_LINES: SampleTerminalLine[] = [
  { kind: "cmd", text: "$ go run ./cmd/api" },
  { kind: "out", text: "config: loaded .env (OWL sample project)" },
  { kind: "out", text: "db: connected to postgres://localhost:5432/zudomart" },
  { kind: "ok", text: "listening on http://localhost:8080" },
  { kind: "out", text: "GET  /health            200  0.4ms" },
  { kind: "out", text: "POST /api/login         401  2.1ms" },
];

export const SAMPLE_TEST_RUN_LINES: SampleTerminalLine[] = [
  { kind: "cmd", text: "$ go test ./..." },
  { kind: "out", text: "ok   zudomart/internal/users     0.18s" },
  { kind: "out", text: "ok   zudomart/internal/payments  0.31s" },
  { kind: "err", text: "?    zudomart/internal/auth      [no test files]" },
  { kind: "ok", text: "PASS  last run before the auth task" },
];

export const TERMINAL_TABS = [
  { id: "agent" as const, icon: TerminalWindow, label: "Agent" },
  { id: "dev" as const, icon: Globe, label: "Dev server" },
  { id: "tests" as const, icon: TestTube, label: "Tests" },
];
