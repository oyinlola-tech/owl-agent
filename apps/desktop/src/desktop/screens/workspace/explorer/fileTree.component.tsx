import { useState } from "react";
import { CaretDown, CaretRight, Folder, FolderOpen, SpinnerGap } from "@phosphor-icons/react";
import { useAppStore } from "../../../state/app.store";
import { agentApi } from "../../../services/agentApi.service";
import type { TreeEntry } from "../../../services/agentApi.types";
import { FileGlyph } from "./fileGlyph.component";

function TreeNode({ entry, projectId, depth }: { entry: TreeEntry; projectId: string; depth: number }) {
  const openFile = useAppStore((s) => s.openFile);
  const openFilePath = useAppStore((s) => s.openFilePath);
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<TreeEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const isDir = entry.type === "directory";
  const toggle = async () => {
    if (!isDir) { openFile(entry.path); return; }
    const next = !expanded;
    setExpanded(next);
    if (next && children === null) {
      setLoading(true);
      try {
        const tree = await agentApi.projectTree(projectId, entry.path);
        setChildren(tree.entries);
      } catch {
        setChildren([]);
      } finally {
        setLoading(false);
      }
    }
  };
  return (
    <div role="treeitem" aria-expanded={isDir ? expanded : undefined} aria-selected={openFilePath === entry.path}>
      <button className={`frow${openFilePath === entry.path ? " on" : ""}${entry.ignored ? " muted" : ""}`} onClick={() => void toggle()}>
        {Array.from({ length: depth }).map((_, index) => <i key={index} className="guide" />)}
        <span className="caret">{isDir ? (expanded ? <CaretDown size={10} weight="bold" /> : <CaretRight size={10} weight="bold" />) : null}</span>
        {isDir
          ? (expanded ? <FolderOpen size={15} weight="duotone" className="ficon-dir" /> : <Folder size={15} weight="duotone" className="ficon-dir" />)
          : <FileGlyph name={entry.name} />}
        <span className="fname">{entry.name}</span>
        {loading && <SpinnerGap size={12} className="pulse" />}
      </button>
      {isDir && expanded && children && <FileTree projectId={projectId} entries={children} depth={depth + 1} />}
    </div>
  );
}

export function FileTree({ projectId, entries, depth = 0 }: { projectId: string; entries: TreeEntry[]; depth?: number }) {
  return (
    <>
      {entries.map((entry) => <TreeNode key={entry.path} entry={entry} projectId={projectId} depth={depth} />)}
    </>
  );
}
