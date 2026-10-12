import { HardDrives, LockKey } from "@phosphor-icons/react";
import { SecurityStatusSection } from "../../system/settings/sections/securityStatus.section";

export function SafetyStep() {
  return (
    <div className="ob-safety">
      <SecurityStatusSection />
      <div className="surface pg-setgroup">
        <h4>Where your data lives</h4>
        <div className="ob-safety-row">
          <HardDrives size={16} weight="duotone" />
          <span>Projects, tasks, and memory are kept in a local database on this computer.</span>
        </div>
        <div className="ob-safety-row">
          <LockKey size={16} weight="duotone" />
          <span>API keys are stored by the service in your system keychain, or a private file if no keychain is available. They never return to this app.</span>
        </div>
      </div>
    </div>
  );
}
