import { useMemo, useState } from "react";
import { ArrowClockwise, MagnifyingGlass, ShieldCheck, WifiSlash } from "@phosphor-icons/react";
import { agentApi } from "../../../../services/agentApi.service";
import { useAppStore } from "../../../../state/app.store";
import type { ProviderCard } from "../../../../services/agentApi.types";
import { detectOperatingSystem } from "./providerStatus.helper";
import { useProviderSetup } from "./providerSetup.hook";
import { ProviderGroupSection } from "./cards/providerGroup.component";
import { ProviderEditSheet } from "./sheet/providerEditSheet.component";
import "./providerSetup.style.css";

const DEFAULT_STORAGE = { backend: "file", detail: "The service stores the key on this computer." };

function ProviderSetupUnavailable({ unauthorized, onRetry }: { unauthorized: boolean; onRetry: () => void }) {
  return (
    <div className="callout orange" role="status">
      <WifiSlash size={18} weight="duotone" color="var(--orange)" />
      <span>
        {unauthorized
          ? "This app can't authenticate with the local OWL service, so your providers can't be read."
          : "OWL's local service isn't running, so your providers can't be shown. Start it to connect a model."}
        {" "}<button className="pv-link-inline" onClick={onRetry}>Retry</button>
      </span>
    </div>
  );
}

export function ProviderSetupPanel({ onActiveChange }: { onActiveChange?: () => void }) {
  const { load, localRunners, discovering, reload, discoverLocal } = useProviderSetup();
  const notify = useAppStore((s) => s.showNotice);
  const [editing, setEditing] = useState<ProviderCard | null>(null);
  const operatingSystem = useMemo(() => detectOperatingSystem(typeof navigator === "undefined" ? "" : navigator.platform), []);

  if (load.state !== "ready") {
    if (load.state === "loading") return <p className="pg-p pg-muted" role="status">Reading your providers…</p>;
    return <ProviderSetupUnavailable unauthorized={load.state === "unauthorized"} onRetry={() => void reload()} />;
  }

  const { providers, key_storage, active } = load.data;
  const storage = key_storage?.detail ? key_storage : DEFAULT_STORAGE;
  const cloud = providers.filter((card) => card.group === "cloud");
  const local = providers.filter((card) => card.group === "local");
  const runnerFor = (id: string) => localRunners.find((runner) => runner.id === id);
  const localCards = local.map((card) => {
    const runner = runnerFor(card.id);
    if (!runner) return card;
    return { ...card, status: runner.running ? "connected" : "not_running", models: runner.models.length ? runner.models : card.models };
  });

  const useProvider = async (card: ProviderCard) => {
    try {
      await agentApi.setActiveProvider(card.id, card.model);
      notify(`${card.label} is now your active provider`);
      await reload();
      onActiveChange?.();
    } catch (error) {
      notify(error instanceof Error ? error.message : `Couldn't switch to ${card.label}.`);
    }
  };

  return (
    <div className="pv-panel">
      <div className="callout blue pv-storage" role="note">
        <ShieldCheck size={18} weight="duotone" color="var(--blue)" />
        <span><b>Where your keys live.</b> {storage.detail} OWL's interface never receives a key back after you save it — only a hint like <code>…abcd</code>.</span>
      </div>

      <ProviderGroupSection group="cloud" cards={cloud} onEdit={setEditing} onUse={(card) => void useProvider(card)} />

      <ProviderGroupSection group="local" cards={localCards} onEdit={setEditing} onUse={(card) => void useProvider(card)}
        aside={
          <button className="btn btn-secondary btn-sm pv-detect" onClick={() => void discoverLocal()} disabled={discovering}>
            {discovering ? <ArrowClockwise size={14} className="pv-spin" /> : <MagnifyingGlass size={14} />}
            {discovering ? "Detecting…" : "Detect local models"}
          </button>
        } />

      {active === "none" && (
        <p className="pg-p pg-muted pv-none" role="status">No provider is active yet. Set up a cloud key or a local model, test it, then choose Use this provider.</p>
      )}

      {editing && (
        <ProviderEditSheet
          card={localCards.find((card) => card.id === editing.id) ?? editing}
          storage={storage} operatingSystem={operatingSystem}
          onClose={() => setEditing(null)}
          onChanged={async () => { await reload(); onActiveChange?.(); }}
          onUse={useProvider} notify={notify}
        />
      )}
    </div>
  );
}
