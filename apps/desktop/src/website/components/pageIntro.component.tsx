import type { ReactNode } from "react";

export function PageIntro({ eyebrow, title, lede, children }: {
  eyebrow: string; title: ReactNode; lede: ReactNode; children?: ReactNode;
}) {
  return (
    <header className="pintro">
      <div className="wrap">
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p className="pintro-lede">{lede}</p>
        {children}
      </div>
    </header>
  );
}
