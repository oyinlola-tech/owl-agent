import { useEffect } from "react";
import "./app.css";
import { useApp } from "./store";
import type { AppScreen } from "./types";
import { AiBar, ConfirmModal, Notice, Palette, Rail, StatusBar } from "./chrome";
import { Welcome, Projects, CreateModal } from "./welcome";
import { Memory } from "./memory";
import { BackendTaskDetail } from "./btask";
import Workspace, { TopBar } from "./workspace";
import { BrowserStudio, Settings, TaskDetail, Tasks } from "./screens";

export default function DesktopApp({ initial = "welcome" }: { initial?: AppScreen }) {
  const screen = useApp((s) => s.screen);
  const palette = useApp((s) => s.palette);
  const aiBar = useApp((s) => s.aiBar);
  const setPalette = useApp((s) => s.setPalette);
  const setAiBar = useApp((s) => s.setAiBar);
  const go = useApp((s) => s.go);
  const toggleTerm = useApp((s) => s.toggleTerm);

  useEffect(() => {
    go(initial);
  }, [initial, go]);

  // Keep the address bar on the current screen without reloading.
  useEffect(() => {
    const target = screen === "welcome" ? "/app" : `/app/${screen}`;
    if (window.location.pathname !== target) {
      window.history.replaceState({}, "", target);
    }
  }, [screen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setPalette(!useApp.getState().palette);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAiBar(!useApp.getState().aiBar);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        toggleTerm();
      } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "b") {
        e.preventDefault();
        useApp.getState().toggleSide();
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "e") {
        e.preventDefault();
        go("workspace");
        useApp.getState().setCenter("changes");
      } else if (e.key === "Escape") {
        setPalette(false);
        setAiBar(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setPalette, setAiBar, toggleTerm, go]);

  return (
    <div className="desk">
      <Rail />
      <div className="main">
        <TopBar onPalette={() => setPalette(true)} onAi={() => setAiBar(true)} />
        {screen === "welcome" && <Welcome />}
        {screen === "workspace" && <Workspace />}
        {screen === "tasks" && <Tasks />}
        {screen === "task" && <TaskDetail />}
        {screen === "btask" && <BackendTaskDetail />}
        {screen === "browser" && <BrowserStudio />}
        {screen === "projects" && <Projects />}
        {screen === "memory" && <Memory />}
        {screen === "settings" && <Settings />}
        <StatusBar onCommand={() => setPalette(true)} />
      </div>
      {palette && <Palette />}
      {aiBar && <AiBar />}
      <CreateModal />
      <ConfirmModal />
      <Notice />
    </div>
  );
}
