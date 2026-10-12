import { useState } from "react";
import { createPortal } from "react-dom";
import { ArrowSquareOut, CheckCircle, Eye, EyeSlash, LockKey, SpinnerGap, Trash, WarningCircle, X } from "@phosphor-icons/react";
import { agentApi } from "../../../../../services/agentApi.service";
import type { ProviderCard, ProviderKeyStorage, ProviderTestRead } from "../../../../../services/agentApi.types";
import { openLinkInSystemBrowser } from "../../../../../../shared/platform/externalLink.platform";
import { describeKeySource, getKeyLinkLabel, localRunnerHowTo } from "../providerStatus.helper";
import { ModelPicker } from "./modelPicker.component";

type SaveState = { phase: "idle" | "testing" | "saving" | "removing" };

export function ProviderEditSheet({ card, storage, operatingSystem, onClose, onChanged, onUse, notify }: {
  card: ProviderCard;
  storage: ProviderKeyStorage;
  operatingSystem: string;
  onClose: () => void;
  onChanged: () => Promise<void>;
  onUse: (card: ProviderCard) => Promise<void>;
  notify: (message: string) => void;
}) {
  const [keyInput, setKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [baseUrl, setBaseUrl] = useState(card.base_url);
  const [model, setModel] = useState(card.model || "auto");
  const [fallbacks, setFallbacks] = useState(card.options.server_fallbacks ?? true);
  const [models, setModels] = useState<string[]>(card.models);
  const [test, setTest] = useState<ProviderTestRead | null>(null);
  const [save, setSave] = useState<SaveState>({ phase: "idle" });
  const [error, setError] = useState("");

  const busy = save.phase !== "idle";
  const canEditKey = !card.key_read_only;
  const needsKey = card.requires_key && !card.has_key && !keyInput.trim();
  const keyLinkLabel = getKeyLinkLabel(card);

  const runTest = async () => {
    setSave({ phase: "testing" }); setError("");
    try {
      const result = await agentApi.testProvider(card.id, {
        key: keyInput.trim() || undefined,
        base_url: card.base_url_editable ? baseUrl.trim() || undefined : undefined,
      });
      setTest(result);
      if (result.ok) setModels(result.models);
    } catch {
      setError("The OWL service didn't answer. Start it, then test again.");
    } finally {
      setSave({ phase: "idle" });
    }
  };

  const persist = async () => {
    setSave({ phase: "saving" }); setError("");
    try {
      if (card.base_url_editable && baseUrl.trim() && baseUrl.trim() !== card.base_url) {
        await agentApi.updateProviderSettings(card.id, { base_url: baseUrl.trim() });
      }
      if (keyInput.trim()) await agentApi.saveProviderKey(card.id, keyInput.trim());
      await agentApi.updateProviderSettings(card.id, {
        model: model === "auto" ? "auto" : model,
        ...(card.kind === "anthropic" ? { server_fallbacks: fallbacks } : {}),
      });
      notify(`${card.label} saved`);
      await onChanged();
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Couldn't save these settings.");
    } finally {
      setSave({ phase: "idle" });
    }
  };

  const removeKey = async () => {
    setSave({ phase: "removing" }); setError("");
    try {
      await agentApi.deleteProviderKey(card.id);
      notify(`${card.label} key removed`);
      await onChanged();
      onClose();
    } catch {
      setError("Couldn't remove the key.");
    } finally {
      setSave({ phase: "idle" });
    }
  };

  const useProvider = async () => {
    setSave({ phase: "saving" });
    try {
      await onUse({ ...card, model });
      onClose();
    } finally {
      setSave({ phase: "idle" });
    }
  };

  return createPortal(
    <div className="pv-sheet-scrim" role="dialog" aria-modal="true" aria-label={`Set up ${card.label}`}
      onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <div className="pv-sheet">
        <header className="pv-sheet-head">
          <div>
            <h3>{card.label}</h3>
            <p>{card.description}</p>
          </div>
          <button className="btn btn-ghost btn-icon btn-sm" aria-label="Close" onClick={onClose} disabled={busy}><X size={16} /></button>
        </header>

        <div className="pv-sheet-body">
          {card.base_url_editable && (
            <label className="pv-field">
              <span className="label">Server address</span>
              <input className="input pv-mono" value={baseUrl} placeholder={card.base_url || "https://…/v1"}
                onChange={(event) => setBaseUrl(event.target.value)} spellCheck={false} />
              <span className="hint">{card.group === "local" ? localRunnerHowTo(card, operatingSystem) : "Must be https unless it runs on this computer."}</span>
            </label>
          )}

          {card.requires_key && (
            <label className="pv-field">
              <span className="label">API key</span>
              {card.key_read_only ? (
                <p className="pv-readonly"><LockKey size={14} /> {describeKeySource(card.key_source)} ({card.key_hint}). Managed outside OWL.</p>
              ) : (
                <>
                  <div className="input-wrap pv-key-wrap">
                    <LockKey size={15} />
                    <input className="input" type={showKey ? "text" : "password"} value={keyInput} autoComplete="off"
                      placeholder={card.has_key ? `Saved ${card.key_hint ?? ""} — paste a new key to replace` : "Paste your key"}
                      onChange={(event) => setKeyInput(event.target.value)} spellCheck={false} aria-label="API key" />
                    <button type="button" className="pv-key-toggle" aria-label={showKey ? "Hide key" : "Show key"}
                      onClick={() => setShowKey((v) => !v)}>{showKey ? <EyeSlash size={15} /> : <Eye size={15} />}</button>
                  </div>
                  <span className="hint">{storage.detail} It never comes back to this app.</span>
                </>
              )}
            </label>
          )}

          {keyLinkLabel && (
            <button className="pv-link" onClick={() => void openLinkInSystemBrowser(card.key_url)}>
              {keyLinkLabel} <ArrowSquareOut size={13} />
            </button>
          )}

          <div className="pv-field">
            <span className="label">Test connection</span>
            <button className="btn btn-secondary btn-sm pv-test-btn" onClick={() => void runTest()} disabled={busy || needsKey}>
              {save.phase === "testing" ? <SpinnerGap size={14} className="pv-spin" /> : <CheckCircle size={14} />}
              {save.phase === "testing" ? "Testing…" : "Test connection"}
            </button>
            {test && (
              <div className={`callout ${test.ok ? "green" : "red"} pv-test-result`} role="status">
                {test.ok
                  ? <><CheckCircle size={16} weight="duotone" color="var(--green)" /><span>Connected in {test.latency_ms ?? 0} ms · {test.model_count} model{test.model_count === 1 ? "" : "s"} available.</span></>
                  : <><WarningCircle size={16} weight="duotone" color="var(--red)" /><span>{test.error || "Couldn't connect."}</span></>}
              </div>
            )}
          </div>

          {models.length > 0 && (
            <label className="pv-field">
              <span className="label">Model</span>
              <ModelPicker models={models} value={model} onChange={setModel} />
              <span className="hint">Auto lets OWL route each task to a fitting model from this provider.</span>
            </label>
          )}

          {card.kind === "anthropic" && (
            <div className="pv-setrow">
              <span className="t"><b>Server-side fallback</b><small>If Claude declines, Anthropic retries on a recommended model.</small></span>
              <button className={`switch${fallbacks ? " on" : ""}`} role="switch" aria-checked={fallbacks}
                aria-label="Server-side fallback" onClick={() => setFallbacks((v) => !v)}><i /></button>
            </div>
          )}

          {error && <div className="callout red" role="alert"><WarningCircle size={16} weight="duotone" color="var(--red)" /><span>{error}</span></div>}
        </div>

        <footer className="pv-sheet-foot">
          {card.has_key && canEditKey
            ? <button className="btn btn-ghost btn-sm pv-danger" onClick={() => void removeKey()} disabled={busy}><Trash size={14} /> Remove key</button>
            : <span />}
          <div className="pv-sheet-foot-main">
            <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={busy}>Cancel</button>
            {!card.key_read_only && (
              <button className="btn btn-primary btn-sm" onClick={() => void persist()} disabled={busy || needsKey}>
                {save.phase === "saving" ? "Saving…" : "Save"}
              </button>
            )}
            {test?.ok && !card.active && (
              <button className="btn btn-dark btn-sm" onClick={() => void useProvider()} disabled={busy}>Use this provider</button>
            )}
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
