import { useOnboardingStore } from "../onboarding.state";
import { ProfileForm } from "../../system/settings/profile/profileForm.component";

export function AboutYouStep() {
  const profileDraft = useOnboardingStore((s) => s.profileDraft);
  const setProfileDraft = useOnboardingStore((s) => s.setProfileDraft);
  return <ProfileForm value={profileDraft} onChange={setProfileDraft} variant="onboarding" />;
}
