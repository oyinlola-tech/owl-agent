import { useEffect, useRef } from "react";
import { WarningCircle } from "@phosphor-icons/react";
import { useAppStore } from "../state/app.store";
import "../styles/dialog.style.css";

export function ConfirmDialog() {
  const confirmation = useAppStore((s) => s.confirm);
  const answerConfirmation = useAppStore((s) => s.answerConfirmation);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!confirmation) return;
    setTimeout(() => confirmButtonRef.current?.focus(), 30);
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") answerConfirmation(false); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirmation, answerConfirmation]);
  if (!confirmation) return null;
  return (
    <div className="overlay overlay-center" onClick={() => answerConfirmation(false)}>
      <div className="modal modal-confirm" onClick={(e) => e.stopPropagation()} role="alertdialog"
        aria-label={confirmation.title} aria-describedby="confirm-body">
        <span className="tile tile-lg orange"><WarningCircle size={20} weight="duotone" /></span>
        <h3>{confirmation.title}</h3>
        <p id="confirm-body" className="modal-body">{confirmation.body}</p>
        <div className="row">
          <button className="btn btn-secondary" onClick={() => answerConfirmation(false)}>Cancel</button>
          <button ref={confirmButtonRef} className="btn btn-danger" onClick={() => answerConfirmation(true)}>{confirmation.confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
