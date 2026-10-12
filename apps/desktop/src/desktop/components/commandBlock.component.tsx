import { useState } from "react";
import { Check, Copy } from "@phosphor-icons/react";
import { copyTextToClipboard } from "../../shared/helpers/clipboard.helper";
import { useAppStore } from "../state/app.store";

export function CommandBlock({ code }: { code: string }) {
  const showNotice = useAppStore((s) => s.showNotice);
  const [justCopied, setJustCopied] = useState(false);
  const copyCode = async () => {
    const copied = await copyTextToClipboard(code);
    setJustCopied(copied);
    showNotice(copied ? "Copied to clipboard" : "Copy failed — select the text instead");
    if (copied) setTimeout(() => setJustCopied(false), 1600);
  };
  return (
    <div className="x-code">
      <pre aria-label="Command">{code.split("\n").map((line, index) => (
        <span key={index}>{line.startsWith("#") ? <i>{line}</i> : <><b>$</b> {line}</>}{"\n"}</span>
      ))}</pre>
      <button className="x-code-copy" onClick={() => void copyCode()} aria-label="Copy command" title="Copy">
        {justCopied ? <Check size={14} weight="bold" /> : <Copy size={14} />}
      </button>
    </div>
  );
}
