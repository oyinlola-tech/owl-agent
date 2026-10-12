import { useAppStore } from "../../state/app.store";
import { useMediaQuery } from "../../../shared/hooks/mediaQuery.hook";

export function useSidebarCollapsed() {
  const screen = useAppStore((s) => s.screen);
  const collapsedPreference = useAppStore((s) => s.sidebarCollapsedPreference);
  const expandedInWorkspace = useAppStore((s) => s.sidebarExpandedInWorkspace);
  const narrow = useMediaQuery("(max-width: 900px)");
  const inWorkspace = screen === "workspace";
  const collapsed = narrow || (inWorkspace ? !expandedInWorkspace : collapsedPreference);
  const toggle = () => {
    const state = useAppStore.getState();
    if (inWorkspace) state.setSidebarExpandedInWorkspace(collapsed);
    else state.setSidebarCollapsedPreference(!collapsed);
  };
  return { collapsed, narrow, toggle };
}
