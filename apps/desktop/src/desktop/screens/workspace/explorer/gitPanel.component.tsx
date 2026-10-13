import { useState } from "react";
import { ArrowClockwise, ArrowDown, ArrowUp, GitBranch, GitCommit } from "@phosphor-icons/react";
import { useAppStore } from "../../../state/app.store";
import { agentApi } from "../../../services/agentApi.service";
import { isServiceAuthError } from "../../../services/connection/serviceRequest.service";
import { useProjectGit } from "../../../hooks/useProjectGit.hook";
import { FileGlyph } from "./fileGlyph.component";

const STATUS_CODE: Record<string, string> = { modified: "M", added: "A", deleted: "D", renamed: "R", untracked: "U", conflicted: "!" };

export function GitPanel({ projectId }: { projectId: string }) {
  const openFile = useAppStore((s) => s.openFile);
  const showNotice = useAppStore((s) => s.showNotice);
  const askForConfirmation = useAppStore((s) => s.askForConfirmation);
  const git = useProjectGit(projectId);
  const [busy, setBusy] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<"push" | "pull" | null>(null);
  const [syncBusy, setSyncBusy] = useState<"push" | "pull" | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncUnauthorized, setSyncUnauthorized] = useState(false);
  if (git.status === "loading") return <div className="side-note">Reading repository…</div>;
  if (git.unauthorized) return <div className="side-note">Sign in to the local service to see source control.</div>;
  if (git.status === "error" || !git.data) {
    return (
      <div className="side-note">
        OWL's local service isn't reachable.
        <button className="btn btn-sm btn-secondary" onClick={git.reload} style={{ marginTop: 6 }}><ArrowClockwise size={13} /> Retry</button>
      </div>
    );
  }
  const summary = git.data;
  if (!summary.is_repo) {
    return <div className="side-note">This project isn't a Git repository yet. Ask OWL to initialise one, then checkpoints and commits become available.</div>;
  }
  const changed = summary.changed;
  const ahead = summary.ahead ?? 0;
  const behind = summary.behind ?? 0;
  const runSync = async (kind: "push" | "pull") => {
    if (syncBusy) return;
    if (pendingConfirm !== kind) {
      setPendingConfirm(kind);
      setSyncError(null);
      return;
    }
    setSyncBusy(kind);
    setSyncError(null);
    setSyncUnauthorized(false);
    try {
      if (kind === "push") {
        await git.push({ confirm: true });
        showNotice("Pushed.");
      } else {
        await git.pull({ confirm: true });
        showNotice("Pulled.");
      }
      setPendingConfirm(null);
    } catch (e) {
      if (isServiceAuthError(e)) {
        setSyncUnauthorized(true);
      } else {
        setSyncError(e instanceof Error ? `${kind === "push" ? "Push" : "Pull"} failed: ${e.message}` : `${kind === "push" ? "Push" : "Pull"} failed`);
      }
    } finally {
      setSyncBusy(null);
    }
  };
  const commitAll = async () => {
    if (changed.length === 0 || busy) return;
    setBusy(true);
    try {
      const draft = await agentApi.generateCommitMessage(projectId);
      const message = draft.message || "Update project files";
      askForConfirmation({
        title: "Commit all changes?",
        body: `${changed.length} file${changed.length === 1 ? "" : "s"} will be committed with the message: "${message}".`,
        confirmLabel: "Commit",
        run: () => {
          void agentApi.gitCommit(projectId, changed.map((c) => c.path), message)
            .then(() => { showNotice("Committed."); git.reload(); })
            .catch((e) => showNotice(e instanceof Error ? `Commit failed: ${e.message}` : "Commit failed"));
        },
      });
    } catch (e) {
      showNotice(e instanceof Error ? `Couldn't draft a message: ${e.message}` : "Couldn't draft a message");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="gitpanel">
      <div className="gitcard">
        <GitBranch size={16} weight="duotone" />
        <div>
          <b>{summary.branch || (summary.detached ? "detached HEAD" : "no branch")}</b>
          <small>{summary.ahead ? `${summary.ahead} ahead · ` : ""}{summary.behind ? `${summary.behind} behind · ` : ""}{summary.upstream || "no upstream"}</small>
        </div>
        <span className="grow" />
        <button className="icon-x" title="Refresh" aria-label="Refresh git status" onClick={git.reload}><ArrowClockwise size={14} /></button>
      </div>
      <div className="gitsync" role="group" aria-label="Remote sync" style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <button
          className="btn btn-secondary btn-sm"
          style={{ flex: 1 }}
          aria-label={ahead > 0 ? `Push ${ahead} commits` : "Push"}
          disabled={syncBusy !== null}
          onClick={() => void runSync("push")}
        >
          <ArrowUp size={14} /> {pendingConfirm === "push" ? "Confirm push" : `Push${ahead > 0 ? ` (${ahead})` : ""}`}
        </button>
        <button
          className="btn btn-secondary btn-sm"
          style={{ flex: 1 }}
          aria-label={behind > 0 ? `Pull ${behind} commits` : "Pull"}
          disabled={syncBusy !== null}
          onClick={() => void runSync("pull")}
        >
          <ArrowDown size={14} /> {pendingConfirm === "pull" ? "Confirm pull" : `Pull${behind > 0 ? ` (${behind})` : ""}`}
        </button>
      </div>
      {pendingConfirm && !syncBusy && (
        <div className="side-note">
          {pendingConfirm === "push" ? "Push publishes your commits to the remote." : "Pull merges the remote into your working tree."} Select again to confirm.
          <button className="btn btn-sm btn-secondary" aria-label={`Cancel ${pendingConfirm}`} style={{ marginTop: 6 }} onClick={() => setPendingConfirm(null)}>Cancel</button>
        </div>
      )}
      {syncBusy && <div className="side-note" role="status">{syncBusy === "push" ? "Pushing…" : "Pulling…"}</div>}
      {syncUnauthorized && <div className="side-note">Sign in to the local service to push or pull.</div>}
      {syncError && (
        <div className="side-note" role="alert">
          {syncError}
          <button className="btn btn-sm btn-secondary" aria-label="Retry sync" style={{ marginTop: 6 }} onClick={() => { setSyncError(null); setPendingConfirm(null); void git.reload(); }}>Retry</button>
        </div>
      )}
      <div className="side-label">Changes · {changed.length}</div>
      {changed.length === 0 && <div className="side-note">Working tree clean.</div>}
      {changed.map((change) => (
        <button key={change.path} className="frow" onClick={() => openFile(change.path)}>
          <FileGlyph name={change.path} />
          <span className="fname">{change.path.split("/").pop()}</span>
          <span className={`chg chg-${STATUS_CODE[change.status] ?? "M"}`}>{STATUS_CODE[change.status] ?? "M"}</span>
        </button>
      ))}
      {changed.length > 0 && (
        <button className="btn btn-secondary btn-sm" style={{ marginTop: 8, width: "100%" }} disabled={busy} onClick={() => void commitAll()}>
          <GitCommit size={14} /> Commit all with generated message
        </button>
      )}
    </div>
  );
}
