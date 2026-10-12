import type { MouseEvent, ReactNode } from "react";
import { navigateTo } from "../../shared/hooks/currentPath.hook";

export function SiteLink({ to, className, children, onClick, ...rest }: {
  to: string; className?: string; children: ReactNode; onClick?: () => void;
  "aria-current"?: "page" | undefined; "aria-label"?: string;
}) {
  const navigateWithoutReload = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.();
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    if (to.startsWith("#") || to.startsWith("/app")) return;
    event.preventDefault();
    const [path, hash] = to.split("#");
    if (path && path !== window.location.pathname) navigateTo(path);
    if (hash) {
      requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView({ block: "start" }));
      window.history.replaceState({}, "", `${path || window.location.pathname}#${hash}`);
    }
  };
  return <a href={to} className={className} onClick={navigateWithoutReload} {...rest}>{children}</a>;
}
