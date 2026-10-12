import type { VerificationRequirement, VerificationRun, VerificationSummary } from "../agentApi.types";
import { daysAgoAt } from "./sampleMode.helper";

const req = (
  id: string, kind: VerificationRequirement["kind"], argv: string[], detail: string,
  extra: Partial<VerificationRequirement> = {},
): VerificationRequirement => ({
  id, kind, argv, cwd: ".", source: "project_manifest", detail, required: true, timeout: 600,
  safe: true, unsafe_reason: "", ...extra,
});

const run = (
  task: string, r: VerificationRequirement, attempt: number, status: VerificationRun["status"],
  exit_code: number | null, ms: number, at: string, stdout = "", stderr = "",
): VerificationRun => ({
  id: `vrun_${task.slice(4, 8)}_${r.kind}_${attempt}`, task_id: task, requirement_id: r.id, kind: r.kind,
  command: r.argv, working_directory: `~/Projects/${task === "tsk_1be4470a" || task === "tsk_3e91a0b5" ? "prooflens" : "scriptune"}`,
  status, exit_code, stdout, stderr, required: r.required, source: r.source, source_detail: r.detail, attempt,
  started_at: at, completed_at: status === "running" ? null : new Date(Date.parse(at) + ms).toISOString(),
  duration_ms: status === "running" ? null : ms,
  error: "", created_at: at,
});
const pTypecheck = req("req-4c1f09a2e7b3", "typecheck", ["pnpm", "run", "typecheck"], "package.json scripts.typecheck (pnpm)");
const pTests = req("req-9a07be55c1d8", "tests", ["pnpm", "run", "test"], "package.json scripts.test (pnpm)");
const pLint = req("req-17d2c4f0aa91", "lint", ["pnpm", "run", "lint"], "package.json scripts.lint (pnpm)", { required: false });
const vTests = req("req-e5b2093c7d10", "tests", [".venv/bin/python", "-m", "pytest", "-q"],
  "pyproject.toml [tool.pytest]; .venv interpreter", { source: "project_configuration" });
const vLint = req("req-2f6a8d41b0c9", "lint", [".venv/bin/python", "-m", "ruff", "check", "."],
  "ruff configuration; .venv interpreter", { source: "project_configuration", required: false });

const PYTEST_FAIL_1 = `F.....                                                                   [100%]
=================================== FAILURES ===================================
_____________________________ test_rounds_half_up ______________________________

    def test_rounds_half_up():
>       assert round_vat(Decimal("10.005")) == Decimal("10.01")
E       AssertionError: assert Decimal('10.00') == Decimal('10.01')
E        +  where Decimal('10.00') = round_vat(Decimal('10.005'))

tests/test_vat.py:9: AssertionError
=========================== short test summary info ============================
FAILED tests/test_vat.py::test_rounds_half_up - AssertionError: assert Decimal('10.00') == Decimal('10.01')
1 failed, 5 passed in 0.41s`;

const PYTEST_FAIL_2 = `.F....                                                                   [100%]
=================================== FAILURES ===================================
__________________________ test_negative_amounts_round __________________________

    def test_negative_amounts_round():
>       assert round_vat(Decimal("-2.345")) == Decimal("-2.35")
E       AssertionError: assert Decimal('-2.34') == Decimal('-2.35')
E        +  where Decimal('-2.34') = round_vat(Decimal('-2.345'))

tests/test_vat.py:14: AssertionError
=========================== short test summary info ============================
FAILED tests/test_vat.py::test_negative_amounts_round - AssertionError: assert Decimal('-2.34') == Decimal('-2.35')
1 failed, 5 passed in 0.38s`;

export const SAMPLE_VERIFICATION: Record<string, { verification: VerificationSummary; verifications: VerificationRun[] }> = {
  tsk_1be4470a: {
    verification: {
      status: "verified_completed", verified: true, verified_at: daysAgoAt(1, 17, 3), note: "", attempts: 1, max_attempts: 3,
      requirements: [pTypecheck, pTests, pLint],
    },
    verifications: [
      run("tsk_1be4470a", pTypecheck, 1, "passed", 0, 3120, daysAgoAt(1, 17, 1), "> prooflens@2.4.0 typecheck\n> tsc --noEmit\n"),
      run("tsk_1be4470a", pTests, 1, "passed", 0, 6840, daysAgoAt(1, 17, 2),
        "> prooflens@2.4.0 test\n> vitest run\n\n ✓ src/api/client.test.ts (9 tests) 212ms\n\n Test Files  1 passed (1)\n      Tests  9 passed (9)\n"),
      run("tsk_1be4470a", pLint, 1, "passed", 0, 1910, daysAgoAt(1, 17, 3), "> prooflens@2.4.0 lint\n> eslint src\n"),
    ],
  },
  tsk_9d33b2f8: {
    verification: {
      status: "completed_unverified", verified: false, verified_at: null, attempts: 0, max_attempts: 3,
      note: "No reliable project verification command was detected.", requirements: [],
    },
    verifications: [],
  },
  tsk_3e91a0b5: {
    verification: {
      status: "running", verified: false, verified_at: null, attempts: 2, max_attempts: 3,
      note: "Required checks not passing: .venv/bin/python -m pytest -q", requirements: [vTests, vLint],
    },
    verifications: [
      run("tsk_3e91a0b5", vTests, 1, "failed", 1, 2410, daysAgoAt(0, 8, 31), PYTEST_FAIL_1),
      run("tsk_3e91a0b5", vTests, 2, "failed", 1, 2280, daysAgoAt(0, 8, 50), PYTEST_FAIL_2),
    ],
  },
};
