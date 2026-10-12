import { useState } from "react";
import { ArrowClockwise, Database, DownloadSimple, FloppyDisk, FolderOpen, Trash, UploadSimple, WarningCircle } from "@phosphor-icons/react";
import { useAppStore } from "../../../../state/app.store";
import { agentApi } from "../../../../services/agentApi.service";
import { canPickFolderNatively, pickImportArchive } from "../../../../services/folderPicker.service";
import type { DataStatus } from "../../../../services/agentApi.types";
import { useAsyncResource } from "../../../../hooks/useAsyncResource.hook";
import { EmptyState } from "../../../../../shared/components/pageLayout.component";
import { SettingValueRow } from "../settingRow.component";

const RESET_PHRASE = "RESET";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DataSettingsSection() {
  const notify = useAppStore((s) => s.showNotice);
  const askForConfirmation = useAppStore((s) => s.askForConfirmation);
  const status = useAsyncResource<DataStatus>(() => agentApi.dataStatus(), []);
  const [busy, setBusy] = useState("");
  const [importPath, setImportPath] = useState("");
  const [resetText, setResetText] = useState("");
  const native = canPickFolderNatively();

  const backupNow = async () => {
    setBusy("backup");
    try { await agentApi.backupData(); notify("Backup created."); status.reload(); }
    catch (e) { notify(e instanceof Error ? e.message : "Backup failed."); }
    finally { setBusy(""); }
  };
  const exportData = async () => {
    setBusy("export");
    try {
      const response = await agentApi.exportDataResponse();
      if (!response.ok) throw new Error(`export failed (${response.status})`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "owl-export.zip";
      anchor.click();
      URL.revokeObjectURL(url);
      notify("Export downloaded. API keys are never included.");
    } catch (e) { notify(e instanceof Error ? e.message : "Export failed."); }
    finally { setBusy(""); }
  };
  const chooseImport = async () => {
    const chosen = await pickImportArchive().catch(() => null);
    if (chosen) setImportPath(chosen);
  };
  const importData = () => {
    if (!importPath.trim()) { notify("Choose an OWL export (.zip) to import."); return; }
    askForConfirmation({
      title: "Import this data?",
      body: "OWL validates the archive and backs up your current data first, then replaces it. Stop any running tasks before importing.",
      confirmLabel: "Import",
      run: () => {
        setBusy("import");
        void agentApi.importData({ path: importPath.trim() })
          .then(() => { notify("Data imported."); setImportPath(""); status.reload(); })
          .catch((e) => notify(e instanceof Error ? e.message : "Import failed."))
          .finally(() => setBusy(""));
      },
    });
  };
  const resetData = () => {
    setBusy("reset");
    void agentApi.resetData(RESET_PHRASE)
      .then(() => { notify("Local data reset. Your saved API keys were kept."); setResetText(""); status.reload(); })
      .catch((e) => notify(e instanceof Error ? e.message : "Reset failed."))
      .finally(() => setBusy(""));
  };

  if (status.status === "loading") return <div className="surface pg-setgroup"><p className="pg-muted pg-p">Reading data status…</p></div>;
  if (status.status === "error" || !status.data) {
    return (
      <EmptyState icon={WarningCircle} hue={status.unauthorized ? "orange" : "red"}
        title={status.unauthorized ? "Sign in to the local service" : "OWL's local service isn't running"}
        body={status.unauthorized ? "The desktop app couldn't authenticate with the local service." : "Start the OWL service to manage local data."}>
        <button className="btn btn-secondary" onClick={status.reload}><ArrowClockwise size={14} /> Retry</button>
      </EmptyState>
    );
  }
  const data = status.data;
  return (
    <>
      <div className="surface pg-setgroup">
        <h4>Local data</h4>
        <p className="pg-muted pg-p">OWL stores everything on this computer. API keys live in the system keyring, never in exports, and a reset keeps them.</p>
        <SettingValueRow title="Data folder" sub={data.data_dir_overridden ? "Set with OWL_DATA_DIR" : "Default location for this platform"}>
          <span className="pg-mono">{data.data_dir}</span>
        </SettingValueRow>
        <SettingValueRow title="Database" sub={`schema v${data.schema_version} of ${data.latest_schema_version} · ${data.journal_mode}`}>
          <span className="pg-mono">{formatBytes(data.database_bytes)}</span>
        </SettingValueRow>
        <div className="pg-setrow">
          <span className="t"><b>Backups</b><small>{data.backups.length} kept{data.last_backup_at ? ` · latest ${new Date(data.last_backup_at).toLocaleString()}` : ""} · keeps {data.backup_policy.daily} daily, {data.backup_policy.weekly} weekly</small></span>
          <button className="btn btn-secondary btn-sm" disabled={busy === "backup"} onClick={() => void backupNow()}><FloppyDisk size={14} /> Back up now</button>
        </div>
      </div>

      <div className="surface pg-setgroup">
        <h4>Export &amp; import</h4>
        <div className="pg-setrow">
          <span className="t"><b>Export data</b><small>A zip of your projects, tasks, memory, and history. API keys are never included.</small></span>
          <button className="btn btn-secondary btn-sm" disabled={busy === "export"} onClick={() => void exportData()}><DownloadSimple size={14} /> Export</button>
        </div>
        <div className="pg-setrow">
          <span className="t" style={{ flex: 1 }}>
            <b>Import data</b>
            <span className="input-wrap" style={{ marginTop: 6 }}>
              <Database size={14} />
              <input className="input pg-mono" value={importPath} placeholder="Path to an OWL export (.zip)" readOnly={native}
                aria-label="Import archive path" onChange={(e) => setImportPath(e.target.value)} />
              {native && <button className="btn btn-secondary btn-sm" onClick={() => void chooseImport()}><FolderOpen size={14} /> Choose…</button>}
            </span>
          </span>
          <button className="btn btn-secondary btn-sm" disabled={busy === "import" || !importPath.trim()} onClick={importData}><UploadSimple size={14} /> Import</button>
        </div>
      </div>

      <div className="surface pg-setgroup">
        <h4>Reset</h4>
        <p className="pg-muted pg-p">Permanently clears projects, tasks, memory, and history after backing up first. Your saved API keys in the keyring are kept. This cannot be undone.</p>
        <div className="pg-setrow">
          <span className="input-wrap" style={{ flex: 1 }}>
            <Trash size={14} />
            <input className="input" value={resetText} placeholder={`Type ${RESET_PHRASE} to confirm`} aria-label="Type RESET to confirm" onChange={(e) => setResetText(e.target.value)} />
          </span>
          <button className="btn btn-secondary btn-sm" disabled={resetText !== RESET_PHRASE || busy === "reset"} onClick={resetData}><Trash size={14} /> Reset data</button>
        </div>
      </div>
    </>
  );
}
