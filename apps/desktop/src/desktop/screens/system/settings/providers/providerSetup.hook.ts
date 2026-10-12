import { useCallback, useEffect, useState } from "react";
import { agentApi, isServiceAuthError } from "../../../../services/agentApi.service";
import type { LocalRunner, ProviderCardsRead } from "../../../../services/agentApi.types";

export type ProviderSetupLoad =
  | { state: "loading" }
  | { state: "ready"; data: ProviderCardsRead }
  | { state: "offline" }
  | { state: "unauthorized" };

export interface ProviderSetupController {
  load: ProviderSetupLoad;
  localRunners: LocalRunner[];
  discovering: boolean;
  reload: () => Promise<void>;
  discoverLocal: () => Promise<void>;
}

export function useProviderSetup(): ProviderSetupController {
  const [load, setLoad] = useState<ProviderSetupLoad>({ state: "loading" });
  const [localRunners, setLocalRunners] = useState<LocalRunner[]>([]);
  const [discovering, setDiscovering] = useState(false);

  const reload = useCallback(async () => {
    setLoad((current) => (current.state === "ready" ? current : { state: "loading" }));
    try {
      setLoad({ state: "ready", data: await agentApi.providers() });
    } catch (error) {
      setLoad({ state: isServiceAuthError(error) ? "unauthorized" : "offline" });
    }
  }, []);

  const discoverLocal = useCallback(async () => {
    setDiscovering(true);
    try {
      const result = await agentApi.localProviders();
      setLocalRunners(result.runners);
    } catch {
      setLocalRunners([]);
    } finally {
      setDiscovering(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  return { load, localRunners, discovering, reload, discoverLocal };
}
