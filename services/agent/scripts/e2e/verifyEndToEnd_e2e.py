from __future__ import annotations

import os
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from crashRecovery_e2e import verify_crash_recovery  # noqa: E402
from scenarioHarness_e2e import created_roots, results  # noqa: E402
from taintScenario_e2e import verify_taint_warning  # noqa: E402
from verificationScenario_e2e import (  # noqa: E402
    verify_claim_with_real_pytest,
    verify_declined_run_is_not_verified,
    verify_fix_after_failure,
    verify_missing_command_is_unverified,
)


def run_all_scenarios() -> int:
    for run in (
        verify_claim_with_real_pytest,
        verify_fix_after_failure,
        verify_crash_recovery,
        verify_declined_run_is_not_verified,
        verify_missing_command_is_unverified,
        verify_taint_warning,
    ):
        run()
    print("\nPhase 5.1 end-to-end verification")
    width = max(len(n) for n, _, _ in results)
    for name, ok, note in results:
        print(f"  {'PASS' if ok else 'FAIL'}  {name.ljust(width)}  {note}")
    failed = [n for n, ok, _ in results if not ok]
    print(f"\n{len(results) - len(failed)}/{len(results)} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    try:
        code = run_all_scenarios()
    finally:
        for root in created_roots:
            shutil.rmtree(root, ignore_errors=True)
    sys.exit(code)
