import { useState } from "react";
import { CaretDown, CaretRight, Folder, FolderOpen } from "@phosphor-icons/react";
import { useAppStore } from "../../../state/app.store";
import type { FileNode } from "../../../state/workspace.types";
import { FileGlyph } from "./fileGlyph.component";

export function FileTree({ nodes, depth = 0, collapsed = false }: { nodes: FileNode[]; depth?: number; collapsed?: boolean }) {
  const openFile = useAppStore((s) => s.openFile);
  const openFilePath = useAppStore((s) => s.openFilePath);
  const editedFiles = useAppStore((s) => s.editedFiles);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>(collapsed ? {} : { src: true, "src/auth": true });
  return (
    <>
      {nodes.map((node) => {
        const isExpanded = !!expandedFolders[node.path];
        return (
          <div key={node.path} role="treeitem" aria-expanded={node.children ? isExpanded : undefined} aria-selected={openFilePath === node.path}>
            <button
              className={`frow${openFilePath === node.path ? " on" : ""}`}
              onClick={() => {
                if (node.children) setExpandedFolders((expanded) => ({ ...expanded, [node.path]: !expanded[node.path] }));
                else openFile(node.path);
              }}
            >
              {Array.from({ length: depth }).map((_, index) => <i key={index} className="guide" />)}
              <span className="caret">{node.children ? (isExpanded ? <CaretDown size={10} weight="bold" /> : <CaretRight size={10} weight="bold" />) : null}</span>
              {node.children
                ? (isExpanded ? <FolderOpen size={15} weight="duotone" className="ficon-dir" /> : <Folder size={15} weight="duotone" className="ficon-dir" />)
                : <FileGlyph name={node.name} />}
              <span className="fname">{node.name}</span>
              {editedFiles[node.path] && <span className="fdot" title="Unsaved edits" />}
            </button>
            {node.children && isExpanded && <FileTree nodes={node.children} depth={depth + 1} collapsed={collapsed} />}
          </div>
        );
      })}
    </>
  );
}
