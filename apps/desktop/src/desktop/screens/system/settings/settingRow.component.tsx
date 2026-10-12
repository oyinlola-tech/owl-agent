import type { ReactNode } from "react";

export function SettingToggleRow({ title, sub, on, onFlip }: { title: string; sub: string; on: boolean; onFlip: () => void }) {
  return (
    <div className="pg-setrow">
      <span className="t"><b>{title}</b><small>{sub}</small></span>
      <button className={`switch${on ? " on" : ""}`} onClick={onFlip} role="switch" aria-checked={on} aria-label={title}><i /></button>
    </div>
  );
}

export function SettingValueRow({ title, sub, children }: { title: string; sub: ReactNode; children: ReactNode }) {
  return (
    <div className="pg-setrow">
      <span className="t"><b>{title}</b><small>{sub}</small></span>
      <span className="v">{children}</span>
    </div>
  );
}
