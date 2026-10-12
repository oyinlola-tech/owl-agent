import type { ReactNode } from "react";
import { Reveal } from "../components/reveal.component";

export function SectionHeading({ eyebrow, title, lede, center }: { eyebrow: string; title: ReactNode; lede?: ReactNode; center?: boolean }) {
  return (
    <Reveal className={`sec-head${center ? " centered" : ""}`}>
      <span className="eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      {lede && <p className="lede">{lede}</p>}
    </Reveal>
  );
}
