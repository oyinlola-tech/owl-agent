import { useEffect, useState } from "react";
import { ArrowCounterClockwise, FloppyDisk, WifiSlash } from "@phosphor-icons/react";
import { useAppStore } from "../../../../state/app.store";
import type { UserProfile } from "../../../../services/agentApi.types";
import { restartOnboarding } from "../../../onboarding/onboarding.state";
import { EMPTY_PROFILE, useUserProfile } from "./profile.hook";
import { ProfileForm } from "./profileForm.component";

function pickProfileFields(profile: UserProfile): UserProfile {
  return {
    display_name: profile.display_name, role: profile.role, experience: profile.experience,
    languages: profile.languages, package_managers: profile.package_managers, code_style: profile.code_style,
    test_framework: profile.test_framework, commit_style: profile.commit_style, tone: profile.tone,
    projects_folder: profile.projects_folder,
  };
}

export function ProfileSettingsSection() {
  const { load, reload, save } = useUserProfile();
  const notify = useAppStore((s) => s.showNotice);
  const [draft, setDraft] = useState<UserProfile>(EMPTY_PROFILE);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (load.state === "ready") setDraft(pickProfileFields(load.profile)); }, [load]);

  const onSave = async () => {
    setSaving(true);
    try {
      await save(draft);
      notify("Profile saved");
    } catch {
      notify("Couldn't save your profile. Is the service running?");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="surface pg-setgroup">
        <h4>How OWL works with you</h4>
        <p className="pg-p pg-muted pf-lede">
          OWL uses this to greet you and to shape its plans and code. It is stored on this computer and never includes secrets.
        </p>
        {load.state === "loading" && <p className="pg-p pg-muted" role="status">Loading your profile…</p>}
        {(load.state === "offline" || load.state === "unauthorized") && (
          <div className="callout orange" role="status">
            <WifiSlash size={18} weight="duotone" color="var(--orange)" />
            <span>
              {load.state === "unauthorized"
                ? "This app can't authenticate with the local OWL service, so your profile can't be loaded."
                : "OWL's local service isn't running, so your profile can't be loaded. Start it and retry."}
              {" "}<button className="pg-link" onClick={() => void reload()}>Retry</button>
            </span>
          </div>
        )}
        {load.state === "ready" && <ProfileForm value={draft} onChange={setDraft} variant="full" />}
      </div>

      {load.state === "ready" && (
        <div className="pf-actions">
          <button className="btn btn-primary" onClick={() => void onSave()} disabled={saving}>
            <FloppyDisk size={15} /> {saving ? "Saving…" : "Save profile"}
          </button>
        </div>
      )}

      <div className="surface pg-setgroup">
        <h4>Setup</h4>
        <div className="pg-setrow">
          <span className="t"><b>Run setup again</b><small>Walk through the first-run steps: profile, model, first project, and the safety check.</small></span>
          <button className="btn btn-secondary btn-sm" onClick={() => restartOnboarding()}><ArrowCounterClockwise size={14} /> Run setup</button>
        </div>
      </div>
    </>
  );
}
