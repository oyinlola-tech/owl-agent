import type { Icon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

export type Hue = "gray" | "brown" | "orange" | "yellow" | "green" | "blue" | "purple" | "pink" | "red";

export function Tag({ hue = "gray", icon: I, dot, children }: { hue?: Hue; icon?: Icon; dot?: boolean; children: ReactNode }) {
  return (
    <span className={`tag tag-${hue}`}>
      {dot && <span className="dot" />}
      {I && <I size={12} weight="bold" />}
      {children}
    </span>
  );
}

export function Tile({ hue = "gray", icon: I, size = "md" }: { hue?: Hue | "ink"; icon: Icon; size?: "md" | "lg" | "xl" }) {
  const px = size === "xl" ? 26 : size === "lg" ? 20 : 16;
  return (
    <span className={`tile ${hue}${size === "lg" ? " tile-lg" : size === "xl" ? " tile-xl" : ""}`}>
      <I size={px} weight="duotone" />
    </span>
  );
}
