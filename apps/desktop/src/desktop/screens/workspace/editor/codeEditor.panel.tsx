import { Suspense, lazy, useEffect, useState } from "react";
import { FileCode, Info, MagnifyingGlass, X } from "@phosphor-icons/react";
import { useAppStore } from "../../../state/app.store";
import { contentFor } from "../../../services/samples/sampleWorkspace.data";
import { EmptyState } from "../../../../shared/components/pageLayout.component";
import { FileGlyph } from "../explorer/fileGlyph.component";
import { EditorErrorBoundary, EditorSkeleton, ReadOnlySourcePreview, useIsDarkThemeApplied } from "./editorFallback.component";
import "./editor.style.css";

const MonacoEditor = lazy(() => import("../../../services/monacoSetup.service").then(() => import("@monaco-editor/react")).then((module) => ({ default: module.default })));

export function CodeEditorPanel() {
  const openFilePath = useAppStore((s) => s.openFilePath);
  const editedFiles = useAppStore((s) => s.editedFiles);
  const saveFileEdit = useAppStore((s) => s.saveFileEdit);
  const isDark = useIsDarkThemeApplied();
  const { lang, code } = contentFor(openFilePath);
  const value = editedFiles[openFilePath] ?? code;
  const editorTabs = useAppStore((s) => s.editorTabs);
  const setEditorTabs = useAppStore((s) => s.setEditorTabs);
  const openFile = useAppStore((s) => s.openFile);
  const setFilePanelSection = useAppStore((s) => s.setFilePanelSection);
  useEffect(() => {
    if (openFilePath && !editorTabs.includes(openFilePath)) setEditorTabs([...editorTabs, openFilePath]);
  }, [openFilePath, editorTabs, setEditorTabs]);
  const [editorMounted, setEditorMounted] = useState(false);
  const [editorLoadIsSlow, setEditorLoadIsSlow] = useState(false);
  useEffect(() => {
    if (editorMounted) return;
    const timer = setTimeout(() => setEditorLoadIsSlow(true), 6000);
    return () => clearTimeout(timer);
  }, [editorMounted]);
  const closeTab = (tabPath: string) => {
    const remainingTabs = editorTabs.filter((path) => path !== tabPath);
    setEditorTabs(remainingTabs);
    if (tabPath === openFilePath && remainingTabs.length) openFile(remainingTabs[Math.max(0, editorTabs.indexOf(tabPath) - 1)]);
  };
  if (editorTabs.length === 0) {
    return (
      <EmptyState icon={FileCode} hue="blue" title="No files open" body="Pick a file in the file panel, or search the project.">
        <button className="btn btn-secondary" onClick={() => setFilePanelSection("search")}><MagnifyingGlass size={14} /> Search files</button>
      </EmptyState>
    );
  }
  return (
    <div className="codeview">
      <div className="ed-tabs" role="tablist" aria-label="Open files">
        {editorTabs.map((tabPath) => (
          <div key={tabPath} className={`ed-tab${openFilePath === tabPath ? " on" : ""}`}>
            <button role="tab" aria-selected={openFilePath === tabPath} onClick={() => openFile(tabPath)} title={tabPath}>
              <FileGlyph name={tabPath} size={14} />
              {tabPath.split("/").pop()}
              {editedFiles[tabPath] && <span className="fdot" title="Modified" />}
            </button>
            <button className="ed-close" onClick={() => closeTab(tabPath)} aria-label={`Close ${tabPath.split("/").pop()}`} title="Close">
              <X size={11} weight="bold" />
            </button>
          </div>
        ))}
      </div>
      <div className="ed-crumb mono">{openFilePath.split("/").join("  ›  ")}</div>
      <div className="ed-body">
        {editorLoadIsSlow && !editorMounted ? (
          <div className="ed-offline">
            <div className="ed-offline-note"><Info size={13} /> The editor couldn't load. Showing a read-only view.</div>
            <ReadOnlySourcePreview path={openFilePath} />
          </div>
        ) : (
          <EditorErrorBoundary fallback={<ReadOnlySourcePreview path={openFilePath} />}>
            <Suspense fallback={<EditorSkeleton />}>
              <MonacoEditor
                onMount={() => setEditorMounted(true)}
                path={openFilePath}
                language={lang}
                value={value}
                theme={isDark ? "owl-dark" : "owl-light"}
                loading={<EditorSkeleton />}
                onChange={(nextValue) => saveFileEdit(openFilePath, nextValue ?? "")}
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
