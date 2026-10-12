import { useRef, useState } from "react";
import { ArrowClockwise, Database, DownloadSimple, FloppyDisk, UploadSimple, Warning } from "@phosphor-icons/react";
import { useAppStore } from "../../../../state/app.store";
import { agentApi } from "../../../../services/agentApi.service";
import { canPickFolderNatively, pickImportArchive } from "../../../../services/folderPicker.service";
import { useAsyncResource } from "../../../../hooks/useAsyncResource.hook";
import { EmptyState, PropertyList, SectionTitle } from "../../../../../shared/components/pageLayout.component";

const RESET_PHRASE = "RESET";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function DataSettingsSection() {
  const notify = useAppStore((s) => s.showNotice);
  const askForConfirmation = useAppStore((s) => s.askForConfirmation);
  const status = useAsyncResource(() => agentApi.dataStatus(), []);
  const [busy, setBusy] = useState("");
  const [resetText, setResetText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const backupNow = async () => {
    setBusy("backup");
    try { await agentApi.backupData(); notify("Backup created."); status.reload(); }
    catch (e) { notify(e instanceof Error ? `Backup failed: ${e.message}` : "Backup failed"); }
    finally { setBusy(""); }
  };
  const exportData = async () => {
    setBusy("export");
    try {
      const response = await agentApi.exportDataResponse();
      if (!response.ok) { notify("Export failed."); return; }
      const blob = await response.blob();
      const name = response.headers.get("content-disposition")?.match(/filename="?([^"]+)"?/)?.[1] ?? "owl-export.zip";
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = name; anchor.click();
      URL.revokeObjectURL(url);
      notify("Export downloaded (API keys are never included).");
    } catch (e) { notify(e instanceof Error ? e.message : "Export failed"); }
    finally { setBusy(""); }
  };
  const importFromPath = async () => {
    const path = await pickImportArchive().catch(() => null);
    if (!path) return;
    await runImport({ path });
  };
  const importFromFile = async (file: File) => {
    const archive_base64 = await fileToBase64(file);
    await runImport({ archive_base64 });
  };
  const runImport = async (body: { path?: string; archive_base64?: string }) => {
    askForConfirmation({
      title: "Import this archive?",
      body: "OWL backs up your current data first, then replaces it with the archive's contents. Stop running tasks before importing.",
      confirmLabel: "Import",
      run: () => {
        setBusy("import");
        void agentApi.importData(body)
          .then(() => { notify("Imported. A backup of your previous data was taken first."); status.reload(); })
          .catch((e) => notify(e instanceof Error ? `Import failed: ${e.message}` : "Import failed"))
          .finally(() => setBusy(""));
      },
    });
  };
  const resetData = () => {
    setBusy("reset");
    void agentApi.resetData(RESET_PHRASE)
      .then(() => { notify("Data reset. Your saved API keys were kept."); setResetText(""); status.reload(); })
      .catch((e) => notify(e instanceof Error ? `Reset failed: ${e.message}` : "Reset failed"))
      .finally(() => setBusy(""));
  };

  if (status.status === "loading") return <div className="side-note" style={{ padding: 16 }}>Loading data status…</div>;
  if (status.status === "error" || !status.data) {
    return (
      <EmptyState icon={Database} hue={status.unauthorized ? "orange" : "red"}
        title={status.unauthorized ? "Sign in to the local service" : "OWL's local service isn't running"}
        body={status.unauthorized ? "The app couldn't authenticate with the local service." : "Start the OWL service to manage your local data."}>
        <button className="btn btn-secondary" onClick={status.reload}><ArrowClockwise size={14} /> Retry</button>
      </EmptyState>
    );
  }
  const data = status.data;
  return (
    <div className="set-sect">
      <SectionTitle>Data management</SectionTitle>
      <p className="set-lede">Everything OWL stores lives on this computer. Back up, export, import, or reset it here.</p>
      <PropertyList rows={[
        { icon: Database, label: "Data folder", value: <span className="mono">{data.data_dir}</span> },
        { icon: Database, label: "Database", value: `${formatBytes(data.database_bytes)} · schema v${data.schema_version}/${data.latest_schema_version}` },
        { icon: Database, label: "Integrity", value: data.integrity },
        { icon: FloppyDisk, label: "Backups", value: `${data.backups.length} kept${data.last_backup_at ? ` · last ${new Date(data.last_backup_at).toLocaleString()}` : ""}` },
      ]} />

      <div className="set-row">
        <div className="t"><b>Back up now</b><small>Takes a snapshot using the SQLite backup API. Backups never contain API keys.</small></div>
        <button className="btn btn-secondary" disabled={busy !== ""} onClick={() => void backupNow()}><FloppyDisk size={15} /> {busy === "backup" ? "Backing up…" : "Back up"}</button>
      </div>
      <div className="set-row">
        <div className="t"><b>Export</b><small>Download a zip of your projects, tasks, and memory. API keys are never included.</small></div>
        <button className="btn btn-secondary" disabled={busy !== ""} onClick={() => void exportData()}><DownloadSimple size={15} /> {busy === "export" ? "Exporting…" : "Export"}</button>
      </div>
      <div className="set-row">
        <div className="t"><b>Import</b><small>Replace your data with a previous export. OWL backs up first.</small></div>
        {canPickFolderNatively() ? (
          <button className="btn btn-secondary" disabled={busy !== ""} onClick={() => void importFromPath()}><UploadSimple size={15} /> Choose file…</button>
        ) : (
          <>
            <input ref={fileInputRef} type="file" accept=".zip" hidden
              onChange={(e) => { const file = e.target.files?.[0]; if (file) void importFromFile(file); e.target.value = ""; }} />
            <button className="btn btn-secondary" disabled={busy !== ""} onClick={() => fileInputRef.current?.click()}><UploadSimple size={15} /> Choose file…</button>
          </>
        )}
      </div>

      <SectionTitle>Reset</SectionTitle>
      <div className="callout red" role="note">
        <Warning size={18} weight="duotone" color="var(--red)" />
        <span>Resetting clears your projects, tasks, memory, and screenshots on this computer. A backup is taken first. Your saved API keys are kept — they live in your system keyring, not the database.</span>
      </div>
      <div className="set-row">
        <div className="t">
          <b>Reset all local data</b>
          <small>Type <b>{RESET_PHRASE}</b> to confirm.</small>
          <input className="input" style={{ marginTop: 6, maxWidth: 200 }} value={resetText} onChange={(e) => setResetText(e.target.value)}
            placeholder={RESET_PHRASE} aria-label="Type RESET to confirm" />
        </div>
        <button className="btn btn-danger" disabled={resetText !== RESET_PHRASE || busy !== ""} onClick={resetData}>{busy === "reset" ? "Resetting…" : "Reset data"}</button>
      </div>
    </div>
  );
}
