import { useRef, useState } from "react";
import { FolderOpen, WarningCircle } from "@phosphor-icons/react";
import { agentApi } from "../../services/agentApi.service";
import type { StackRecommendation } from "../../services/agentApi.types";
import { useAppStore } from "../../state/app.store";
import { canPickFolderNatively, pickProjectFolder } from "../../services/folderPicker.service";

export type ScaffoldStepId = "starter" | "git" | "open";

export interface ScaffoldStepDef {
  id: ScaffoldStepId;
  title: string;
  detail: string;
}

export function scaffoldStepList(recommendation: StackRecommendation): ScaffoldStepDef[] {
  return [
    {
      id: "starter",
      title: "Run the starter command",
      detail: recommendation.starter_command?.trim()
        ? `Runs \`${recommendation.starter_command.trim()}\` in the new project. Asks first; high-risk or network access asks again.`
        : "No starter command ships with this stack.",
    },
    {
      id: "git",
      title: "Initialise git and commit",
      detail: "Runs `git init`, stages everything, and makes a first commit. Asks first.",
    },
    {
      id: "open",
      title: "Open the project",
      detail: "Opens the scaffolded folder in the workspace.",
    },
  ];
}

type StepStatus = "todo" | "running" | "done" | "error" | "skipped";

function isOfflineMessage(message: string): boolean {
  return /unreachable|service isn't|network_error|failed to fetch|load failed/i.test(message);
}

export function ProjectScaffoldPanel({ recommendation }: { recommendation: StackRecommendation }) {
  const showNotice = useAppStore((s) => s.showNotice);
  const askForConfirmation = useAppStore((s) => s.askForConfirmation);
  const openProject = useAppStore((s) => s.openProject);
  const [folder, setFolder] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<ScaffoldStepId, StepStatus>>({ starter: "todo", git: "todo", open: "todo" });
  const [folderError, setFolderError] = useState("");
  const [stepError, setStepError] = useState("");
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState<ScaffoldStepId | "folder" | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [stoppedNote, setStoppedNote] = useState("");
  const cancelRef = useRef<(() => void) | null>(null);
  const native = canPickFolderNatively();
  const stackName = recommendation.stack.name;
  const starterCommand = recommendation.starter_command?.trim() ?? "";
  const steps = scaffoldStepList(recommendation);

  const appendLog = (line: string) => setLog((prev) => [...prev.slice(-49), line]);

  const failStep = (step: ScaffoldStepId, e: unknown) => {
    const message = e instanceof Error ? e.message : typeof e === "string" ? e : "That step failed.";
    setStatuses((s) => ({ ...s, [step]: "error" }));
    setStepError(message);
    setOffline(isOfflineMessage(message));
    setBusy(null);
    showNotice(`Scaffold stopped after the completed steps. Nothing was rolled back. ${message}`);
  };

  const streamCommand = (pid: string, command: string, opts: { confirm_high_risk?: boolean; allow_network?: boolean } = {}): Promise<Record<string, unknown>> =>
    new Promise<Record<string, unknown>>((resolve, reject) => {
      appendLog(`$ ${command}`);
      cancelRef.current = agentApi.runProjectCommand(pid, { command, ...opts }, {
        onOutput: (_stream, text) => appendLog(text.replace(/\n+$/, "")),
        onCompleted: (data) => resolve(data),
        onError: (code, detail, data) => reject({ code, detail, data }),
      });
    }).catch(async (err: { code?: string; detail?: string; data?: Record<string, unknown> }) => {
      const code = String(err?.code ?? "error");
      const detail = String(err?.detail ?? "Command failed.");
      if (code === "confirmation_required") {
        const reason = err?.data?.reason ? ` — ${String(err.data.reason)}` : "";
        await new Promise<void>((done) => {
          askForConfirmation({
            title: "Run this high-risk command?",
            body: `${detail}${reason} It runs in the project sandbox.`,
            confirmLabel: "Run it",
            run: () => {
              void streamCommand(pid, command, { ...opts, confirm_high_risk: true }).then(() => done()).catch(() => done());
            },
          });
        });
        return streamCommand(pid, command, { ...opts, confirm_high_risk: true });
      }
      if (code === "network_confirmation_required") {
        await new Promise<void>((done) => {
          askForConfirmation({
            title: "Allow network access?",
            body: `${detail} Only allow it if you trust this command.`,
            confirmLabel: "Allow network",
            run: () => {
              void streamCommand(pid, command, { ...opts, allow_network: true }).then(() => done()).catch(() => done());
            },
          });
        });
        return streamCommand(pid, command, { ...opts, allow_network: true });
      }
      throw new Error(detail);
    });

  const chooseFolder = async () => {
    setFolderError("");
    const chosen = await pickProjectFolder().catch(() => null);
    if (chosen) setFolder(chosen);
  };

  const createProjectForFolder = async (): Promise<string | null> => {
    if (!folder.trim()) {
      setFolderError("Choose a folder on this computer to continue.");
      return null;
    }
    setFolderError("");
    setOffline(false);
    setBusy("folder");
    try {
      const result = await agentApi.createProject(folder.trim());
      setProjectId(result.project.id);
      return result.project.id;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Couldn't add the project.";
      setFolderError(message);
      setOffline(isOfflineMessage(message));
      return null;
    } finally {
      setBusy(null);
    }
  };

  const runStarter = (pid: string) => {
    if (!starterCommand) {
      setStatuses((s) => ({ ...s, starter: "skipped" }));
      return;
    }
    askForConfirmation({
      title: `Run the ${stackName} starter?`,
      body: `This runs \`${starterCommand}\` inside ${folder.trim() || "the new project"}. Review it first; you can stop it at any time.`,
      confirmLabel: "Run starter",
      run: () => {
        void (async () => {
          setStatuses((s) => ({ ...s, starter: "running" }));
          setStepError("");
          setStoppedNote("");
          setBusy("starter");
          try {
            const done = await streamCommand(pid, starterCommand);
            const exit = Number((done as Record<string, unknown>).exit_code ?? 0);
            if (exit !== 0) throw new Error(`Starter exited with code ${exit}. The project folder is kept.`);
            setStatuses((s) => ({ ...s, starter: "done" }));
          } catch (e) {
            failStep("starter", e);
          } finally {
            setBusy(null);
          }
        })();
      },
    });
  };

  const runGitInit = (pid: string) => {
    askForConfirmation({
      title: "Initialise git and commit?",
      body: "Runs `git init`, stages all files, and makes a first commit. Earlier steps are kept either way.",
      confirmLabel: "Init and commit",
      run: () => {
        void (async () => {
          setStatuses((s) => ({ ...s, git: "running" }));
          setStepError("");
          setStoppedNote("");
          setBusy("git");
          try {
            await streamCommand(pid, "git init");
            await streamCommand(pid, "git add -A");
            let files: string[] = [];
            try {
              const summary = await agentApi.gitSummary(pid);
              files = summary.changed.map((c) => c.path);
            } catch {
              files = [];
            }
            let message = `Initial commit from ${stackName}`;
            try {
              const draft = await agentApi.generateCommitMessage(pid);
              if (draft.message?.trim()) message = draft.message.trim();
            } catch {
              // Keep the default message when no draft is available.
            }
            if (files.length > 0) {
              await agentApi.gitCommit(pid, files, message);
            } else {
              await streamCommand(pid, `git commit -m "${message.replace(/"/g, "'")}"`);
            }
            setStatuses((s) => ({ ...s, git: "done" }));
          } catch (e) {
            failStep("git", e);
          } finally {
            setBusy(null);
          }
        })();
      },
    });
  };

  const openScaffolded = async (pid: string) => {
    setBusy("open");
    setStepError("");
    try {
      const res = await agentApi.getProject(pid);
      setStatuses((s) => ({ ...s, open: "done" }));
      openProject(res.project);
    } catch (e) {
      failStep("open", e);
    } finally {
      setBusy(null);
    }
  };

  const stopRunning = () => {
    cancelRef.current?.();
    cancelRef.current = null;
    setBusy(null);
    setStoppedNote("Stopped. Completed steps are kept; re-run the current step to continue.");
    showNotice("Scaffold stopped. Completed steps are kept.");
  };

  const statusLabel = (status: StepStatus) =>
    status === "done" ? "Done" : status === "running" ? "In progress…" : status === "error" ? "Failed" : status === "skipped" ? "Skipped" : "Not started";

  return (
    <section className="pg-scaffold" aria-label={`Scaffold ${stackName} project`} style={{ marginTop: 12 }}>
      <h4>Scaffold {stackName}</h4>
      <p className="side-note">Pick a folder, then work through three approval-gated steps. Stopping keeps every completed step.</p>
      <ol>
        {steps.map((step, index) => (
          <li key={step.id}>
            <b>Step {index + 1}: {step.title}</b> <span className="side-note">— {statusLabel(statuses[step.id])}</span>
            <div className="side-note">{step.detail}</div>
          </li>
        ))}
      </ol>

      <label className="label" htmlFor="pg-scaffold-folder">Project folder</label>
      <div className="input-wrap">
        <FolderOpen size={15} />
        <input
          id="pg-scaffold-folder"
          className="input pg-mono"
          type="text"
          value={folder}
          spellCheck={false}
          readOnly={native}
          placeholder="~/Projects/my-app"
          aria-label="Scaffold project folder"
          disabled={busy !== null}
          onChange={(e) => setFolder(e.target.value)}
        />
        {native && (
          <button className="btn btn-secondary btn-sm" onClick={() => void chooseFolder()} disabled={busy !== null}>
            Choose…
          </button>
        )}
      </div>
      {!native && (
        <span className="hint">Type an absolute path to a folder on this computer. Protected locations are refused.</span>
      )}
      {folderError && <div role="alert" className="error-text">{folderError}</div>}
      {offline && !folderError && !stepError && (
        <p className="side-note" role="status">OWL&apos;s local service isn&apos;t reachable. Start it, then retry.</p>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        {!projectId ? (
          <button
            className="btn btn-primary btn-sm"
            aria-label="Create project folder entry"
            disabled={busy !== null || !folder.trim()}
            onClick={() => { void createProjectForFolder().then((pid) => { if (pid && starterCommand) runStarter(pid); }); }}
          >
            {busy === "folder" ? "Adding…" : "Scaffold project"}
          </button>
        ) : (
          <>
            {statuses.starter !== "done" && statuses.starter !== "skipped" && (
              <button
                className="btn btn-primary btn-sm"
                aria-label="Run starter command"
                disabled={busy !== null}
                onClick={() => runStarter(projectId)}
              >
                {busy === "starter" ? "Running starter…" : starterCommand ? "Run starter" : "Skip starter"}
              </button>
            )}
            {!starterCommand && statuses.starter === "todo" && (
              <button
                className="btn btn-secondary btn-sm"
                aria-label="Skip starter command"
                disabled={busy !== null}
                onClick={() => setStatuses((s) => ({ ...s, starter: "skipped" }))}
              >
                Skip starter
              </button>
            )}
            {(statuses.starter === "done" || statuses.starter === "skipped") && statuses.git !== "done" && (
              <button
                className="btn btn-primary btn-sm"
                aria-label="Initialise git and commit"
                disabled={busy !== null}
                onClick={() => runGitInit(projectId)}
              >
                {busy === "git" ? "Committing…" : "Init git and commit"}
              </button>
            )}
            {statuses.git === "done" && statuses.open !== "done" && (
              <button
                className="btn btn-primary btn-sm"
                aria-label="Open scaffolded project"
                disabled={busy !== null}
                onClick={() => void openScaffolded(projectId)}
              >
                {busy === "open" ? "Opening…" : "Open project"}
              </button>
            )}
            {busy !== null && (
              <button className="btn btn-secondary btn-sm" aria-label="Stop scaffold step" onClick={stopRunning}>
                Stop
              </button>
            )}
          </>
        )}
      </div>

      {starterCommand && (
        <p className="side-note">Starter command: <code>{starterCommand}</code></p>
      )}
      {!starterCommand && (
        <p className="side-note">No starter command ships with this stack. Skip to git once the folder is ready.</p>
      )}

      {log.length > 0 && (
        <div className="side-note" role="status" aria-label="Scaffold output">
          {log.slice(-6).map((line, i) => (
            <div key={`${i}-${line.slice(0, 24)}`}><code>{line}</code></div>
          ))}
        </div>
      )}
      {stoppedNote && <p className="side-note" role="status">{stoppedNote}</p>}
      {stepError && (
        <p className="side-note" role="alert">
          <WarningCircle size={14} /> {stepError}{" "}
          {offline ? "Start the OWL service, then re-run the failed step. Completed steps are kept." : "Completed steps are kept; fix the issue, then re-run the failed step."}
        </p>
      )}
      {statuses.starter === "done" && statuses.git === "done" && statuses.open === "done" && (
        <p className="side-note" role="status">Scaffolded {stackName}: starter ran, first commit made, project opened.</p>
      )}
    </section>
  );
}
