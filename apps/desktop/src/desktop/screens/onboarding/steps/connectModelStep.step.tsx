import { agentApi } from "../../../services/agentApi.service";
import { useOnboardingStore } from "../onboarding.state";
import { ProviderSetupPanel } from "../../system/settings/providers/providerSetup.component";

export function ConnectModelStep() {
  const setProviderConfigured = useOnboardingStore((s) => s.setProviderConfigured);
  const refreshActive = async () => {
    try {
      const data = await agentApi.providers();
      setProviderConfigured(data.configured && data.active !== "none" && data.active !== "mock");
    } catch {
      setProviderConfigured(false);
    }
  };
  return <ProviderSetupPanel onActiveChange={() => void refreshActive()} />;
}
