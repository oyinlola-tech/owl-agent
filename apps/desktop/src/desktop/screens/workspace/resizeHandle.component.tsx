import { useRef } from "react";

export function VerticalResizeHandle({ onDrag }: { onDrag: (deltaX: number) => void }) {
  const dragStartX = useRef(0);
  return (
    <div
      className="rz-v"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panel"
      title="Drag to resize"
      onPointerDown={(event) => {
        event.preventDefault();
        dragStartX.current = event.clientX;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (event.buttons === 1) onDrag(event.clientX - dragStartX.current);
      }}
    />
  );
}

export function HorizontalResizeHandle({ onDrag }: { onDrag: (deltaY: number) => void }) {
  const dragStartY = useRef(0);
  return (
    <div
      className="rz-h"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize terminal"
      title="Drag to resize"
      onPointerDown={(event) => {
        event.preventDefault();
        dragStartY.current = event.clientY;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (event.buttons === 1) onDrag(dragStartY.current - event.clientY);
      }}
    />
  );
}
