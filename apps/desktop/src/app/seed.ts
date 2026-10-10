import type { Approval, ChangeFile, ChatMsg, FileNode, Project, Task, TermLine } from "./types";

export const PROJECTS: Project[] = [
  { name: "ZudoMart", path: "~/Projects/zudomart", opened: "12m ago" },
  { name: "ProofLens", path: "~/Projects/prooflens", opened: "yesterday" },
  { name: "Scriptune", path: "~/Projects/scriptune", opened: "2d ago" },
  { name: "Owl Agent", path: "~/Projects/owl-agent", opened: "3d ago" },
];

export const FILES: FileNode[] = [
  {
    name: "src", path: "src",
    children: [
      {
        name: "api", path: "src/api",
        children: [{ name: "client.ts", path: "src/api/client.ts" }],
      },
      {
        name: "auth", path: "src/auth",
        children: [
          { name: "service.go", path: "src/auth/service.go" },
          { name: "middleware.go", path: "src/auth/middleware.go" },
        ],
      },
      {
        name: "users", path: "src/users",
        children: [{ name: "model.go", path: "src/users/model.go" }],
      },
      { name: "main.go", path: "src/main.go" },
    ],
  },
  {
    name: "frontend", path: "frontend",
    children: [
      {
        name: "components", path: "frontend/components",
        children: [{ name: "Header.tsx", path: "frontend/components/Header.tsx" }],
      },
      {
        name: "pages", path: "frontend/pages",
        children: [{ name: "index.tsx", path: "frontend/pages/index.tsx" }],
      },
    ],
  },
  {
    name: "tests", path: "tests",
    children: [{ name: "auth_test.go", path: "tests/auth_test.go" }],
  },
];

export const CODE_SAMPLE = `package auth

import (
\t"crypto/sha256"
\t"time"
)

type Service struct {
\tdb     *DB
\tpepper string
}

func (s *Service) Login(ctx context.Context, email, pw string) (string, error) {
\tif email == "" || pw == "" {
\t\treturn "", ErrMissingCredentials
\t}
\ttoken, err := s.issueToken(ctx, email, 24*time.Hour)
\tif err != nil {
\t\treturn "", err
\t}
\treturn token, nil
}`;

export const FILE_CONTENTS: Record<string, { lang: string; code: string }> = {
  "src/auth/service.go": { lang: "go", code: CODE_SAMPLE },
  "src/auth/middleware.go": {
    lang: "go",
    code: `package auth

import "net/http"

func Middleware(next http.Handler) http.Handler {
\treturn http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
\t\ttoken := r.Header.Get("Authorization")
\t\tif token == "" {
\t\t\thttp.Error(w, "missing token", http.StatusUnauthorized)
\t\t\treturn
\t\t}
\t\tnext.ServeHTTP(w, r)
\t})
}`,
  },
  "src/users/model.go": {
    lang: "go",
    code: `package users

import "time"

type User struct {
\tID        string
\tEmail     string
\tCreatedAt time.Time
}`,
  },
  "src/main.go": {
    lang: "go",
    code: `package main

import (
\t"log"
\t"net/http"
)

func main() {
\tmux := http.NewServeMux()
\tmux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
\t\tw.Write([]byte("ok"))
\t})
\tlog.Fatal(http.ListenAndServe(":3000", mux))
}`,
  },
  "src/api/client.ts": {
    lang: "typescript",
    code: `export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "content-type": "application/json" } });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}`,
  },
  "frontend/components/Header.tsx": {
    lang: "typescript",
    code: `export function Header({ project }: { project: string }) {
  return (
    <header>
      <strong>OWL</strong>
      <span>{project}</span>
    </header>
  );
}`,
  },
  "frontend/pages/index.tsx": {
    lang: "typescript",
    code: `import { Header } from "../components/Header";

export default function Home() {
  return (
    <main>
      <Header project="ZudoMart" />
      <h1>Storefront</h1>
    </main>
  );
}`,
  },
  "tests/auth_test.go": {
    lang: "go",
    code: `package auth_test

import (
\t"context"
\t"testing"
)

func TestLoginRejectsEmpty(t *testing.T) {
\tsvc := &Service{}
\tif _, err := svc.Login(context.Background(), "", ""); err == nil {
\t\tt.Fatal("expected error")
\t}
}`,
  },
};

export function contentFor(path: string): { lang: string; code: string } {
  return FILE_CONTENTS[path] ?? { lang: "plaintext", code: `// ${path}\n// (mock) select a project file to inspect it.` };
}

export const INITIAL_CHAT: ChatMsg[] = [
  { id: "m1", from: "you", text: "Add authentication to the API with JWT and PostgreSQL." },
  {
    id: "m2", from: "owl",
    text: "I will inspect the existing authentication, database, and user structure first. Users exist but there is no auth layer yet.",
    plan: [
      "Create password service",
      "Add JWT authentication",
      "Add auth middleware",
      "Add login endpoint",
      "Add tests",
    ],
  },
];

export const INITIAL_TERMINAL: TermLine[] = [
  { id: "t0", kind: "out", text: "owl workspace ready. type a task or press Run to replay the sample." },
];

export const TASKS: Task[] = [
  {
    id: "task-1", name: "Build authentication", project: "ZudoMart",
    status: "running", progress: 72, started: "10:42 PM", elapsed: "08:31",
    plan: ["Create password service", "Add JWT authentication", "Add auth middleware", "Add login endpoint", "Add tests"],
    files: ["src/auth/service.go", "src/auth/jwt.go", "src/auth/middleware.go", "tests/auth_test.go"],
    commands: ["go test ./...", "go build ./..."],
    note: "Running tests for the new middleware.",
  },
  {
    id: "task-2", name: "Fix API timeout", project: "ProofLens",
    status: "completed", progress: 100, started: "8:10 PM", elapsed: "23m",
    plan: ["Reproduce timeout", "Raise context deadline", "Add retry", "Add tests"],
    files: ["src/api/client.ts"],
    commands: ["npm test"],
    note: "Completed 23 minutes ago.",
  },
  {
    id: "task-3", name: "Create landing page", project: "Scriptune",
    status: "completed", progress: 100, started: "4:02 PM", elapsed: "2h",
    plan: ["Draft sections", "Build hero", "Add pricing", "Polish footer"],
    files: ["frontend/pages/index.tsx"],
    commands: ["npm run build"],
    note: "Completed 2 hours ago.",
  },
  {
    id: "task-4", name: "Deploy staging", project: "ZudoMart",
    status: "failed", progress: 41, started: "Yesterday", elapsed: "11m",
    plan: ["Build image", "Push registry", "Rollout"],
    files: [],
    commands: ["docker push registry/zudo:staging"],
    note: "Registry push rejected the tag.",
  },
];

export const SAMPLE_APPROVALS: Approval[] = [
  {
    id: "a1", kind: "files", title: "Create 4 files", status: "pending",
    files: ["src/auth/service.go", "src/auth/jwt.go", "src/auth/middleware.go", "tests/auth_test.go"],
    reason: "New authentication layer for the API.",
    risk: "Low",
  },
  {
    id: "a2", kind: "command", title: "Run command", status: "pending",
    command: "go test ./...", dir: "~/Projects/zudomart",
    reason: "Verify authentication changes.", risk: "Low",
  },
];

export const SAMPLE_CHANGES: ChangeFile[] = [
  {
    path: "src/auth/service.go", status: "M",
    before: "func Login(user User) error",
    after: "func Login(ctx context.Context, user User) (string, error)",
  },
  { path: "src/auth/jwt.go", status: "A", before: "", after: "func issueToken(ctx context.Context, sub string, ttl time.Duration) (string, error)" },
  { path: "src/old_auth.go", status: "D", before: "func legacyAuth() {}", after: "" },
];

export const COMMANDS = [
  "New Task", "Open Project", "Open File", "Search Project", "Ask OWL",
  "Run Command", "Run Tests", "Open Terminal", "Toggle Sidebar", "Toggle Inspector",
  "Toggle Terminal", "Open Browser", "Review Changes", "Undo Change",
  "Git Commit", "Git Push", "Open Settings", "Pause Agent", "Resume Agent",
];

export const TEMPLATES = ["Empty", "Next.js", "React", "Python", "FastAPI", "Go", "Node.js", "React Native / Expo"];
