import { useCallback, useEffect, useState } from "react";
import { agentApi, isServiceAuthError } from "../../../../services/agentApi.service";
import type { UserProfile, UserProfileRead } from "../../../../services/agentApi.types";

export const EMPTY_PROFILE: UserProfile = {
  display_name: "", role: "", experience: "", languages: [], package_managers: [],
  code_style: "", test_framework: "", commit_style: "", tone: "", projects_folder: "",
};

export type ProfileLoad =
  | { state: "loading" }
  | { state: "ready"; profile: UserProfileRead }
  | { state: "offline" }
  | { state: "unauthorized" };

export function useUserProfile() {
  const [load, setLoad] = useState<ProfileLoad>({ state: "loading" });

  const reload = useCallback(async () => {
    setLoad((current) => (current.state === "ready" ? current : { state: "loading" }));
    try {
      setLoad({ state: "ready", profile: await agentApi.profile() });
    } catch (error) {
      setLoad({ state: isServiceAuthError(error) ? "unauthorized" : "offline" });
    }
  }, []);

  const save = useCallback(async (profile: Partial<UserProfile>) => {
    const saved = await agentApi.saveProfile(profile);
    setLoad({ state: "ready", profile: saved });
    return saved;
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  return { load, reload, save };
}
