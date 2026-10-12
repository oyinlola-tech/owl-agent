import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "../styles/popover.style.css";

type PopoverPlacement = "bottom-start" | "bottom-end" | "top-start" | "right-start" | "right-end";

export function usePopover(placement: PopoverPlacement) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({ visibility: "hidden" });
  const close = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  };
  const computePosition = () => {
    const triggerRect = trigger.current?.getBoundingClientRect();
    if (!triggerRect) return;
    const viewportWidth = window.innerWidth, viewportHeight = window.innerHeight, gap = 6;
    const position: CSSProperties = {};
    if (placement === "bottom-start") {
      position.top = triggerRect.bottom + gap;
      position.left = Math.max(8, Math.min(triggerRect.left, viewportWidth - 300));
    } else if (placement === "bottom-end") {
      position.top = triggerRect.bottom + gap;
      position.right = Math.max(8, viewportWidth - triggerRect.right);
    } else if (placement === "top-start") {
      position.bottom = viewportHeight - triggerRect.top + gap;
      position.left = Math.max(8, triggerRect.left);
    } else if (placement === "right-start") {
      position.top = Math.max(8, triggerRect.top);
      position.left = triggerRect.right + gap + 2;
    } else {
      position.bottom = Math.max(8, viewportHeight - triggerRect.bottom);
      position.left = triggerRect.right + gap + 2;
    }
    setStyle(position);
  };
  useLayoutEffect(() => {
    if (open) computePosition();
    else setStyle({ visibility: "hidden" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, placement]);
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panel.current?.contains(target) || trigger.current?.contains(target)) return;
      close(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.stopPropagation(); close(true); }
    };
    const onResize = () => computePosition();
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("resize", onResize);
    const focusTimer = setTimeout(() => panel.current?.querySelector<HTMLElement>("button:not(:disabled), a[href], [tabindex='0']")?.focus(), 20);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("resize", onResize);
      clearTimeout(focusTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return { open, toggle: () => setOpen((isOpen) => !isOpen), close, trigger, panel, style };
}

export function Popover({ popover, label, className = "", children }: {
  popover: ReturnType<typeof usePopover>; label: string; className?: string; children: ReactNode;
}) {
  if (!popover.open) return null;
  return createPortal(
    <div ref={popover.panel} className={`pop ${className}`} style={popover.style} role="dialog" aria-label={label}>
      {children}
    </div>,
    document.body,
  );
}
