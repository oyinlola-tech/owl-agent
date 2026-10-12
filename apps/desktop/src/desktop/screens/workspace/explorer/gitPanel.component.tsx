import { useState } from "react";
import { ArrowClockwise, GitBranch, GitCommit } from "@phosphor-icons/react";
import { useAppStore } from "../../../state/app.store";
import { agentApi } from "../../../services/agentApi.service";
import { useProjectGit } from "../../../hooks/useProjectGit.hook";
import { FileGlyph } from "./fileGlyph.component";

const STATUS_CODE: Record<string, string> = { modified: "M", added: "A", deleted: "D", renamed: "R", untracked: "U", conflicted: "!" };

export function GitPanel({ projectId }: { projectId: string }) {
  const openFile = useAppStore((s) => s.openFile);
  const showNotice = useAppStore((s) => s.showNotice);
  const askForConfirmation = useAppStore((s) => s.askForConfirmation);
  const git = useProjectGit(projectId);
  const [busy, setBusy] = useState(false);
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
