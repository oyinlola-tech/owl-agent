import { useEffect } from "react";
import { useAppStore } from "../state/app.store";
import { isTypingInTextField } from "../../shared/helpers/keyboard.helper";

export function useGlobalShortcuts() {
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const setAskOwlOpen = useAppStore((s) => s.setAskOwlOpen);
  const goToScreen = useAppStore((s) => s.goToScreen);
  const toggleTerminal = useAppStore((s) => s.toggleTerminal);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const withModifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (withModifier && event.shiftKey && key === "p") {
        event.preventDefault();
        setCommandPaletteOpen(!useAppStore.getState().commandPaletteOpen);
      } else if (withModifier && key === "k") {
        event.preventDefault();
        setAskOwlOpen(!useAppStore.getState().askOwlOpen);
      } else if (withModifier && key === "j") {
        event.preventDefault();
        toggleTerminal();
      } else if (withModifier && !event.shiftKey && key === "b" && !isTypingInTextField(event.target)) {
        event.preventDefault();
        useAppStore.getState().toggleFilePanel();
      } else if (withModifier && event.shiftKey && key === "e") {
        event.preventDefault();
        goToScreen("workspace");
        useAppStore.getState().setCenterTab("changes");
      } else if (event.key === "?" && !event.ctrlKey && !event.metaKey && !event.altKey && !isTypingInTextField(event.target)) {
        event.preventDefault();
        useAppStore.getState().setShortcutsOpen(true);
      } else if (event.key === "Escape") {
        setCommandPaletteOpen(false);
        setAskOwlOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setCommandPaletteOpen, setAskOwlOpen, toggleTerminal, goToScreen]);
}
