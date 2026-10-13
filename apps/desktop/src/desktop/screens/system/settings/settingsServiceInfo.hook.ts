import { useEffect, useState } from "react";
import { agentApi } from "../../../services/agentApi.service";
import type { ModelEntry, ProviderRead } from "../../../services/agentApi.types";

export function useSettingsServiceInfo() {
  const [provider, setProvider] = useState<ProviderRead | null>(null);
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [roots, setRoots] = useState<string[]>([]);
  const [health, setHealth] = useState<string>("checking");
  const reload = async () => {
    setProvider(await agentApi.provider().catch(() => null));
    setModels(await agentApi.registry().then((r) => r.models).catch(() => [] as ModelEntry[]));
    setRoots(await agentApi.workspaces().then((w) => w.roots).catch(() => [] as string[]));
    agentApi.health().then((status) => setHealth(`online · v${status.version}`)).catch(() => setHealth("offline"));
  };
  useEffect(() => { void reload(); }, []);
  return { provider, models, roots, health, reload };
}

export type SettingsServiceInfo = ReturnType<typeof useSettingsServiceInfo>;

export function useProviderVerification(notify: (message: string) => void) {
  const [verifying, setVerifying] = useState(false);
  const [verdict, setVerdict] = useState("");
  const [verdictOk, setVerdictOk] = useState(false);
  const verifyProvider = async () => {
    setVerifying(true);
    setVerdict("");
    try {
      const result = await agentApi.verifyProvider();
      setVerdictOk(result.ok);
      setVerdict(result.ok ? `Connected to ${result.provider} with ${result.model}.` : `Check failed (${result.code}): ${result.error}`);
      notify(result.ok ? "Provider verified" : "Provider check failed");
    } catch (e) {
      setVerdictOk(false);
      setVerdict(`The OWL service didn't answer (${e instanceof Error ? e.message : "unreachable"}). Start it, then verify again.`);
    } finally {
      setVerifying(false);
    }
  };
  return { verifying, verdict, verdictOk, verifyProvider };
}

export type ProviderVerification = ReturnType<typeof useProviderVerification>;
