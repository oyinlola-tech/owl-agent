import { CheckCircle, Cpu, LockKey, ShieldCheck, SpinnerGap, XCircle } from "@phosphor-icons/react";
import { useAppStore } from "../../../../state/app.store";
import { SampleDataBanner } from "../../../../../shared/components/pageLayout.component";
import { Tag } from "../../../../../shared/components/tag.component";
import { SettingToggleRow, SettingValueRow } from "../settingRow.component";
import type { ProviderVerification, SettingsServiceInfo } from "../settingsServiceInfo.hook";

export function AiSettingsSection({ serviceInfo, verification }: { serviceInfo: SettingsServiceInfo; verification: ProviderVerification }) {
  const liveChatEnabled = useAppStore((s) => s.liveChatEnabled);
  const setLiveChatEnabled = useAppStore((s) => s.setLiveChatEnabled);
  const preferredModel = useAppStore((s) => s.preferredModel);
  const setPreferredModel = useAppStore((s) => s.setPreferredModel);
  const goToScreen = useAppStore((s) => s.goToScreen);
  const { provider, providerDemo, models, reload } = serviceInfo;
  const { verifying, verdict, verdictOk, verifyProvider } = verification;
  const providerTag = providerDemo ? <Tag hue="yellow" dot>Sample</Tag>
    : provider ? provider.configured ? <Tag hue="green" dot>Configured</Tag> : <Tag hue="yellow" dot>Mock</Tag>
    : <Tag hue="gray" dot>Offline</Tag>;
  const usableModels = models.filter((model) => model.status === "available" || model.status === "verified");
  const selectedModel = models.find((model) => model.id === preferredModel);
  return (
    <>
      {providerDemo && <SampleDataBanner onRetry={() => void reload()} what="provider details" />}
      <div className="surface pg-setgroup">
        <h4>Provider</h4>
        <SettingValueRow title="Provider" sub={provider ? `${provider.name} · ${provider.model || "default model"}` : "Not connected"}>{providerTag}</SettingValueRow>
        <div className="pg-setrow">
          <span className="t"><b>Verify connection</b><small>Checks the key and model without spending tokens. The key itself never leaves the service.</small></span>
          <button className="btn btn-secondary btn-sm" disabled={verifying} onClick={verifyProvider}>
            {verifying ? <SpinnerGap size={14} /> : <ShieldCheck size={14} />} {verifying ? "Checking…" : "Verify"}
          </button>
        </div>
        {verdict && (
          <div className={`callout ${verdictOk ? "green" : "red"}`}>
            {verdictOk ? <CheckCircle size={16} weight="duotone" color="var(--green)" /> : <XCircle size={16} weight="duotone" color="var(--red)" />}
            <span>{verdict}</span>
          </div>
        )}
        <SettingValueRow title="API key" sub="Set NVIDIA_API_KEY in the service environment. Without it, a deterministic mock answers.">
          <Tag hue={provider?.configured ? "green" : "gray"} icon={LockKey}>{provider?.configured ? "Present" : "Not set"}</Tag>
        </SettingValueRow>
      </div>
      <div className="surface pg-setgroup">
        <h4>Model</h4>
        <div className="pg-setrow">
          <span className="t"><b>Default model</b><small>Auto lets the router pick per task: code, debug, long context, or vision.</small></span>
          <select className="input pg-select" value={preferredModel} onChange={(e) => setPreferredModel(e.target.value)} aria-label="Default model">
            <option value="auto">Auto (recommended)</option>
            {usableModels.map((model) => <option key={model.id} value={model.id}>{model.id}</option>)}
          </select>
        </div>
        <SettingValueRow title="Context window" sub="How much the selected model reads at once. OWL compresses older context at 80%.">
          <span className="pg-mono">{selectedModel?.context_window ? `${selectedModel.context_window.toLocaleString()} tokens` : "Varies by routed model"}</span>
        </SettingValueRow>
        <div className="pg-setrow">
          <span className="t"><b>Models and usage</b><small>Refresh the registry, validate models, and see token use per task.</small></span>
          <button className="btn btn-secondary btn-sm" onClick={() => goToScreen("models")}><Cpu size={14} /> Open</button>
        </div>
      </div>
      <div className="surface pg-setgroup">
        <h4>Agent</h4>
        <SettingToggleRow title="Live model replies" sub="Send chat through the service instead of the sample replay." on={liveChatEnabled} onFlip={() => setLiveChatEnabled(!liveChatEnabled)} />
        <SettingValueRow title="Step limits" sub="Set on the service with OWL_MAX_ITERATIONS, OWL_MAX_MODEL_CALLS, and OWL_MAX_ELAPSED.">
          <span className="pg-mono">25 steps · 40 calls · 30 min</span>
        </SettingValueRow>
      </div>
    </>
  );
}
