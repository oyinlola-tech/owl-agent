import { useState } from "react";
import { CaretUpDown, Check, File, Folder, FolderOpen, Paperclip } from "@phosphor-icons/react";
import { useAppStore } from "../../../state/app.store";
import { Popover, usePopover } from "../../../components/popover.component";

export function ChatContextPicker() {
  const project = useAppStore((s) => s.project);
  const openFilePath = useAppStore((s) => s.openFilePath);
  const [scope, setScope] = useState<"file" | "folder" | "project">("project");
  const contextPopover = usePopover("top-start");
  const openFolderPath = openFilePath.split("/").slice(0, -1).join("/") || "/";
  return (
    <>
      <button ref={contextPopover.trigger} className="ctx-chip ctx-btn" onClick={contextPopover.toggle} aria-haspopup="dialog" aria-expanded={contextPopover.open}
        aria-label="Choose what OWL can see">
        <Paperclip size={13} /> {scope === "file" ? openFilePath.split("/").pop() : scope === "folder" ? openFolderPath : (project?.name ?? "Project")}
        <CaretUpDown size={11} />
      </button>
      <Popover popover={contextPopover} label="Context" className="pop-ctx">
        <div className="pop-title">OWL can read</div>
        {([
          ["file", File, "Current file", openFilePath],
          ["folder", Folder, "Current folder", openFolderPath],
          ["project", FolderOpen, "Current project", project?.path ?? "~/Projects"],
        ] as const).map(([id, ScopeIcon, label, detail]) => (
          <button key={id} className={`pop-item${scope === id ? " on" : ""}`} onClick={() => { setScope(id); contextPopover.close(); }}>
            <ScopeIcon size={16} /><span className="pop-main"><b>{label}</b><small className="mono">{detail}</small></span>
            {scope === id && <Check size={14} weight="bold" className="pop-check" />}
          </button>
        ))}
      </Popover>
    </>
  );
}
