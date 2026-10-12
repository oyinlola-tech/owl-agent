import { useEffect } from "react";
import { CheckCircle, WarningCircle, X } from "@phosphor-icons/react";
import { useAppStore } from "../state/app.store";
import "../styles/dialog.style.css";

export function Toast() {
  const notice = useAppStore((s) => s.notice);
  const showNotice = useAppStore((s) => s.showNotice);
  useEffect(() => {
    if (!notice) return;
    const dismissTimer = setTimeout(() => showNotice(null), 3200);
    return () => clearTimeout(dismissTimer);
  }, [notice, showNotice]);
  if (!notice) return null;
  const isProblem = /unreachable|fail|offline|error/i.test(notice);
  return (
    <div className="toast" role="status" key={notice}>
      {isProblem ? <WarningCircle size={16} weight="fill" style={{ color: "var(--orange)" }} /> : <CheckCircle size={16} weight="fill" style={{ color: "var(--green)" }} />}
      <span>{notice}</span>
      <button className="toast-x" onClick={() => showNotice(null)} aria-label="Dismiss"><X size={12} /></button>
    </div>
  );
}
