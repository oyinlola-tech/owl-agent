import { useEffect, useState } from "react";
import { Bell, Database, FolderOpen, GearSix, GitBranch, Info, Keyboard, LockKey, Plugs, ShieldCheck, SlidersHorizontal, Sparkle, UserCircle, Wrench, type Icon } from "@phosphor-icons/react";
import { useAppStore } from "../../../state/app.store";
import { agentApi } from "../../../services/agentApi.service";
import { PageHeader } from "../../../../shared/components/pageLayout.component";
import { applyThemeMode, readThemeMode, type ThemeMode } from "../../../../shared/hooks/themeMode.hook";
import { copyTextAndNotify } from "../../../../shared/helpers/clipboard.helper";
import { removeStoredKeysStartingWith } from "../../../../shared/helpers/storage.helper";
import {
  DEFAULT_SETTINGS_PREFS, readSettingsPrefs, readStartScreen, saveSettingsPrefs, saveStartScreen, type SettingsPrefs,
} from "./settingsPrefs.helper";
import { useProviderVerification, useSettingsServiceInfo } from "./settingsServiceInfo.hook";
import { AiSettingsSection } from "./sections/aiSettings.section";
import { AiProvidersSettingsSection } from "./providers/aiProvidersSettings.section";
import { ProfileSettingsSection } from "./profile/profileSettings.section";
import { GitSettingsSection, PermissionSettingsSection, SecuritySettingsSection, WorkspaceSettingsSection } from "./sections/accessSettings.section";
import { GeneralSettingsSection, KeyboardSettingsSection, NotificationSettingsSection } from "./sections/generalSettings.section";
import { AboutSettingsSection, AdvancedSettingsSection } from "./sections/systemSettings.section";
import { DataSettingsSection } from "./data/dataSettings.section";
import "./settings.style.css";

type SettingsSectionName = "General" | "Profile" | "AI providers" | "AI" | "Permissions" | "Workspaces" | "Security" | "Git" | "Data" | "Notifications" | "Keyboard" | "Advanced" | "About";

const SETTINGS_SECTIONS: { name: SettingsSectionName; icon: Icon }[] = [
  { name: "General", icon: SlidersHorizontal },
  { name: "Profile", icon: UserCircle },
  { name: "AI providers", icon: Plugs },
  { name: "AI", icon: Sparkle },
  { name: "Permissions", icon: ShieldCheck },
  { name: "Workspaces", icon: FolderOpen },
  { name: "Security", icon: LockKey },
  { name: "Git", icon: GitBranch },
  { name: "Data", icon: Database },
  { name: "Notifications", icon: Bell },
  { name: "Keyboard", icon: Keyboard },
  { name: "Advanced", icon: Wrench },
  { name: "About", icon: Info },
];

export function SettingsScreen() {
  const [activeSection, setActiveSection] = useState<SettingsSectionName>("General");
  const liveChatEnabled = useAppStore((s) => s.liveChatEnabled);
  const preferredModel = useAppStore((s) => s.preferredModel);
  const notify = useAppStore((s) => s.showNotice);
  const askForConfirmation = useAppStore((s) => s.askForConfirmation);
  const serviceInfo = useSettingsServiceInfo();
  const verification = useProviderVerification(notify);
  const [themeMode, setThemeMode] = useState<ThemeMode>(readThemeMode);
  const [startScreen, setStartScreen] = useState(readStartScreen);
  const [prefs, setPrefs] = useState<SettingsPrefs>(readSettingsPrefs);
  const [notificationPermission, setNotificationPermission] = useState<string>(() => ("Notification" in window ? Notification.permission : "unsupported"));
  const { provider, providerDemo, health, reload } = serviceInfo;

  useEffect(() => { document.documentElement.toggleAttribute("data-motion-reduce", prefs.motion); }, [prefs.motion]);

  const togglePref = (key: string) => setPrefs((current) => {
    const next = { ...current, [key]: !current[key] };
    saveSettingsPrefs(next);
    return next;
  });
  const pickThemeMode = (mode: ThemeMode) => { setThemeMode(mode); applyThemeMode(mode); };
  const pickStartScreen = (screen: string) => { setStartScreen(screen); saveStartScreen(screen); };
  const askNotificationPermission = async () => {
    if (!("Notification" in window)) { notify("This browser doesn't support desktop notifications."); return; }
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    notify(permission === "granted" ? "Desktop notifications on" : "Notifications stay off. You can allow them in system settings.");
  };
  const resetLayout = () => askForConfirmation({
    title: "Reset interface layout?",
    body: "Clears saved panel sizes, views, theme and these settings on this device. Projects, tasks, and memory are not touched.",
    confirmLabel: "Reset layout",
    run: () => {
      removeStoredKeysStartingWith("owl-");
      setPrefs({ ...DEFAULT_SETTINGS_PREFS }); setThemeMode("system"); applyThemeMode("system");
      notify("Layout reset. Reload to apply panel sizes.");
    },
  });
  const copyDiagnostics = () => copyTextAndNotify([
    "OWL Agent 0.1.0",
    `Service: ${agentApi.baseUrl} (${health})`,
    `Provider: ${provider ? `${provider.name} · ${provider.model} · ${provider.configured ? "configured" : "mock"}` : "unknown"}${providerDemo ? " [sample]" : ""}`,
    `Model preference: ${preferredModel}`,
    `Live chat: ${liveChatEnabled ? "on" : "off"}`,
    `User agent: ${navigator.userAgent}`,
  ].join("\n"), notify, "Diagnostics copied");

  return (
    <div className="page pg-settingspage">
      <PageHeader icon={GearSix} hue="gray" title="Settings" lede="Model provider, agent permissions, Git safety, and appearance." />
      <div className="pg-settings">
        <nav className="pg-setnav" aria-label="Settings sections">
          {SETTINGS_SECTIONS.map((section) => (
            <button key={section.name} className={activeSection === section.name ? "on" : ""} onClick={() => setActiveSection(section.name)} aria-current={activeSection === section.name ? "page" : undefined}>
              <section.icon size={16} weight={activeSection === section.name ? "duotone" : "regular"} />{section.name}
            </button>
          ))}
        </nav>
        <div className="pg-setbody" key={activeSection}>
          {activeSection === "General" && (
            <GeneralSettingsSection themeMode={themeMode} onPickThemeMode={pickThemeMode} startScreen={startScreen}
              onPickStartScreen={pickStartScreen} prefs={prefs} onTogglePref={togglePref} />
          )}
          {activeSection === "Profile" && <ProfileSettingsSection />}
          {activeSection === "AI providers" && <AiProvidersSettingsSection />}
          {activeSection === "AI" && <AiSettingsSection serviceInfo={serviceInfo} verification={verification} />}
          {activeSection === "Permissions" && <PermissionSettingsSection prefs={prefs} onTogglePref={togglePref} />}
          {activeSection === "Workspaces" && (
            <WorkspaceSettingsSection roots={serviceInfo.roots} rootsDemo={serviceInfo.rootsDemo} onRetry={() => void reload()} />
          )}
          {activeSection === "Security" && <SecuritySettingsSection />}
          {activeSection === "Git" && <GitSettingsSection prefs={prefs} onTogglePref={togglePref} />}
          {activeSection === "Data" && <DataSettingsSection />}
          {activeSection === "Notifications" && (
            <NotificationSettingsSection notificationPermission={notificationPermission} onAskPermission={() => void askNotificationPermission()}
              prefs={prefs} onTogglePref={togglePref} />
          )}
          {activeSection === "Keyboard" && <KeyboardSettingsSection />}
          {activeSection === "Advanced" && <AdvancedSettingsSection health={health} onCopyDiagnostics={copyDiagnostics} onResetLayout={resetLayout} />}
          {activeSection === "About" && <AboutSettingsSection health={health} />}
        </div>
      </div>
    </div>
  );
}
