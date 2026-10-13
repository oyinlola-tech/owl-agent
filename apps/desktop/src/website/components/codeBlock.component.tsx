import { useState } from "react";
import { Check, Copy } from "@phosphor-icons/react";
import { copyTextToClipboard } from "../../shared/helpers/clipboard.helper";
import "../styles/codeBlock.style.css";

export function CodeBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copyCodeWithoutCommentLines = async () => {
    const stripped = code.split("\n").filter((line) => !line.startsWith("#")).map((line) => (line.startsWith("$ ") ? line.slice(2) : line)).join("\n");
    const copiedToClipboard = await copyTextToClipboard(stripped);
    if (!copiedToClipboard) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };
  return (
    <div className="code">
      <div className="code-bar">
        <span>{label ?? "Terminal"}</span>
        <button className="code-copy" onClick={copyCodeWithoutCommentLines} aria-label={copied ? "Copied" : "Copy code"}>
          {copied ? <Check size={14} weight="bold" /> : <Copy size={14} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre>
        {code.split("\n").map((line, index) => (
          <div key={index} className={line.startsWith("#") ? "c-com" : line.startsWith("$ ") ? "c-cmd" : ""}>{line || " "}</div>
        ))}
      </pre>
    </div>
  );
}
