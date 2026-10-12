import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { FileCode, FloppyDisk, Info, MagnifyingGlass, X } from "@phosphor-icons/react";
import { useAppStore } from "../../../state/app.store";
import { agentApi } from "../../../services/agentApi.service";
import { ApiError } from "../../../services/connection/serviceRequest.service";
import { useProjectFile } from "../../../hooks/useProjectFile.hook";
import { EmptyState } from "../../../../shared/components/pageLayout.component";
import { FileGlyph } from "../explorer/fileGlyph.component";
import { EditorErrorBoundary, EditorSkeleton, ReadOnlySourcePreview, useIsDarkThemeApplied } from "./editorFallback.component";
import "./editor.style.css";

const MonacoEditor = lazy(() => import("../../../services/monacoSetup.service").then(() => import("@monaco-editor/react")).then((module) => ({ default: module.default })));

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript", mjs: "javascript", py: "python",
  go: "go", rs: "rust", json: "json", md: "markdown", css: "css", scss: "scss", html: "html", java: "java",
  kt: "kotlin", rb: "ruby", php: "php", sh: "shell", bash: "shell", yml: "yaml", yaml: "yaml", toml: "ini",
  sql: "sql", c: "c", h: "cpp", cpp: "cpp", cc: "cpp", swift: "swift", dart: "dart",
};
function languageForPath(path: string): string {
  return LANGUAGE_BY_EXTENSION[path.split(".").pop()?.toLowerCase() ?? ""] ?? "plaintext";
}

export function CodeEditorPanel() {
  const project = useAppStore((s) => s.project);
  const openFilePath = useAppStore((s) => s.openFilePath);
  const editorTabs = useAppStore((s) => s.editorTabs);
  const setEditorTabs = useAppStore((s) => s.setEditorTabs);
  const openFile = useAppStore((s) => s.openFile);
  const setFilePanelSection = useAppStore((s) => s.setFilePanelSection);
  const showNotice = useAppStore((s) => s.showNotice);
  const askForConfirmation = useAppStore((s) => s.askForConfirmation);
  const isDark = useIsDarkThemeApplied();
  const file = useProjectFile(project?.id ?? null, openFilePath);
  const [buffer, setBuffer] = useState("");
  const [savedSha, setSavedSha] = useState("");
  const [saving, setSaving] = useState(false);
  const loadedPathRef = useRef("");
  useEffect(() => {
    if (openFilePath && !editorTabs.includes(openFilePath)) setEditorTabs([...editorTabs, openFilePath]);
  }, [openFilePath, editorTabs, setEditorTabs]);
  useEffect(() => {
    if (file.status === "ready" && file.data && loadedPathRef.current !== file.data.path) {
      loadedPathRef.current = file.data.path;
      setBuffer(file.data.content);
      setSavedSha(file.data.sha256);
    }
  }, [file.status, file.data]);
  const dirty = file.status === "ready" && buffer !== (file.data?.content ?? buffer);
  const save = () => {
    if (!project || !openFilePath || saving || !dirty) return;
    setSaving(true);
    agentApi.saveProjectFile(project.id, { path: openFilePath, content: buffer, base_sha256: savedSha })
      .then((result) => { setSavedSha(result.sha256); showNotice("Saved."); file.reload(); })
      .catch((error) => {
        if (error instanceof ApiError && error.code === "file_changed") {
          askForConfirmation({
            title: "This file changed on disk",
            body: "The file was modified since you opened it. Reload the latest version? Your unsaved edits will be discarded.",
            confirmLabel: "Reload file",
            run: () => { loadedPathRef.current = ""; file.reload(); },
          });
        } else {
          showNotice(error instanceof Error ? `Couldn't save: ${error.message}` : "Couldn't save the file");
        }
      })
      .finally(() => setSaving(false));
  };
  const closeTab = (tabPath: string) => {
    const remainingTabs = editorTabs.filter((path) => path !== tabPath);
    setEditorTabs(remainingTabs);
    if (tabPath === openFilePath && remainingTabs.length) openFile(remainingTabs[Math.max(0, editorTabs.indexOf(tabPath) - 1)]);
  };
  if (!project || editorTabs.length === 0 || !openFilePath) {
    return (
      <EmptyState icon={FileCode} hue="blue" title="No files open" body="Pick a file in the file panel, or search the project.">
        <button className="btn btn-secondary" onClick={() => setFilePanelSection("search")}><MagnifyingGlass size={14} /> Search files</button>
      </EmptyState>
    );
  }
  return (
    <div className="codeview" onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(); } }}>
      <div className="ed-tabs" role="tablist" aria-label="Open files">
        {editorTabs.map((tabPath) => (
          <div key={tabPath} className={`ed-tab${openFilePath === tabPath ? " on" : ""}`}>
            <button role="tab" aria-selected={openFilePath === tabPath} onClick={() => openFile(tabPath)} title={tabPath}>
              <FileGlyph name={tabPath} size={14} />
              {tabPath.split("/").pop()}
              {openFilePath === tabPath && dirty && <span className="fdot" title="Unsaved edits" />}
            </button>
            <button className="ed-close" onClick={() => closeTab(tabPath)} aria-label={`Close ${tabPath.split("/").pop()}`} title="Close">
              <X size={11} weight="bold" />
            </button>
          </div>
        ))}
      </div>
      <div className="ed-crumb mono">
        {openFilePath.split("/").join("  ›  ")}
        <span className="grow" />
        <button className="btn btn-ghost btn-sm" disabled={!dirty || saving} onClick={save}><FloppyDisk size={13} /> {saving ? "Saving…" : "Save"}</button>
      </div>
      <div className="ed-body">
        {file.status === "loading" && <EditorSkeleton />}
        {file.status === "error" && (
          <div className="ed-offline">
            <div className="ed-offline-note"><Info size={13} /> {file.unauthorized ? "Sign in to the local service to open files." : file.offline ? "OWL's local service isn't reachable." : file.error?.message ?? "This file can't be opened."}</div>
          </div>
        )}
        {file.status === "ready" && (
          <EditorErrorBoundary fallback={<ReadOnlySourcePreview code={buffer} />}>
            <Suspense fallback={<EditorSkeleton />}>
              <MonacoEditor
                path={openFilePath}
                language={languageForPath(openFilePath)}
                value={buffer}
                theme={isDark ? "owl-dark" : "owl-light"}
                loading={<EditorSkeleton />}
                onChange={(nextValue) => setBuffer(nextValue ?? "")}
                options={{
                  minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false, padding: { top: 14 },
                  fontFamily: "'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, monospace",
                  renderLineHighlight: "gutter", lineNumbersMinChars: 3, smoothScrolling: true,
                }}
              />
            </Suspense>
          </EditorErrorBoundary>
        )}
      </div>
    </div>
  );
}
