import { useState, type KeyboardEvent } from "react";
import { Info } from "@phosphor-icons/react";
import { CodeBlock } from "../../../components/codeBlock.component";
import { Reveal } from "../../../components/reveal.component";
import { RELEASE_REPOSITORY } from "../release/latestRelease.service";
import { githubCliPatternFor, type DetectedPlatform } from "../release/releaseAssets.helper";
import { INSTALL_SCRIPT_BASE_URL, UNIX_INSTALL_COMMAND, WINDOWS_INSTALL_COMMAND } from "../links/stableDownloadLink.helper";

type TerminalTabId = "unix" | "windows" | "github";

const TERMINAL_TABS: { id: TerminalTabId; label: string }[] = [
  { id: "unix", label: "macOS and Linux" },
  { id: "windows", label: "Windows (PowerShell)" },
  { id: "github", label: "GitHub CLI" },
];

function defaultTabFor(platform: DetectedPlatform): TerminalTabId {
  return platform.os === "windows" ? "windows" : "unix";
}

function TerminalTabPanel({ tabId, platform }: { tabId: TerminalTabId; platform: DetectedPlatform }) {
  if (tabId === "unix") {
    return (
      <>
        <p>Downloads the right installer for your system from the latest GitHub release, checks it against <span className="mono">SHA256SUMS.txt</span>, and installs it.</p>
        <CodeBlock label="Terminal" code={UNIX_INSTALL_COMMAND} />
      </>
    );
  }
  if (tabId === "windows") {
    return (
      <>
        <p>Run in PowerShell. Downloads the Windows installer from the latest release, checks its SHA-256, and starts it.</p>
        <CodeBlock label="PowerShell" code={WINDOWS_INSTALL_COMMAND} />
      </>
    );
  }
  return (
    <>
      <p>Already signed in to the GitHub CLI? Download the installer for your system and the checksums directly.</p>
      <CodeBlock label="GitHub CLI" code={`gh release download --repo ${RELEASE_REPOSITORY} --pattern '${githubCliPatternFor(platform)}' --pattern 'SHA256SUMS.txt'`} />
      <p className="dl-hint">Change the pattern for another system: <span className="mono">*-setup.exe</span>, <span className="mono">*_aarch64.dmg</span>, <span className="mono">*_x64.dmg</span>, <span className="mono">*_amd64.AppImage</span>, <span className="mono">*_amd64.deb</span>, or <span className="mono">*.x86_64.rpm</span>.</p>
    </>
  );
}

export function TerminalInstallSection({ platform }: { platform: DetectedPlatform }) {
  const [chosenTab, setChosenTab] = useState<TerminalTabId | null>(null);
  const activeTab = chosenTab ?? defaultTabFor(platform);

  const moveBetweenTabs = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const currentIndex = TERMINAL_TABS.findIndex((tab) => tab.id === activeTab);
    const step = event.key === "ArrowRight" ? 1 : -1;
    const nextTab = TERMINAL_TABS[(currentIndex + step + TERMINAL_TABS.length) % TERMINAL_TABS.length];
    setChosenTab(nextTab.id);
    document.getElementById(`terminal-tab-${nextTab.id}`)?.focus();
  };

  return (
    <Reveal className="dl-terminal">
      <section id="terminal" aria-labelledby="terminal-title">
        <h2 id="terminal-title">Install from the terminal</h2>
        <div className="seg dl-tabs" role="tablist" aria-label="Install method" onKeyDown={moveBetweenTabs}>
          {TERMINAL_TABS.map((tab) => (
            <button key={tab.id} id={`terminal-tab-${tab.id}`} role="tab" type="button"
              className={activeTab === tab.id ? "on" : ""} aria-selected={activeTab === tab.id}
              aria-controls="terminal-panel" tabIndex={activeTab === tab.id ? 0 : -1} onClick={() => setChosenTab(tab.id)}>
              {tab.label}
            </button>
          ))}
        </div>
        <div id="terminal-panel" role="tabpanel" aria-labelledby={`terminal-tab-${activeTab}`} className="dl-tabpanel">
          <TerminalTabPanel tabId={activeTab} platform={platform} />
        </div>
        <div className="callout blue dl-verify">
          <Info size={18} weight="duotone" />
          <span>
            <b>Read a script before you pipe it into a shell.</b> Open the{" "}
            <a href={`${INSTALL_SCRIPT_BASE_URL}/owl.install.sh`} target="_blank" rel="noopener noreferrer">shell script</a> or the{" "}
            <a href={`${INSTALL_SCRIPT_BASE_URL}/owl.install.ps1`} target="_blank" rel="noopener noreferrer">PowerShell script</a> first.
            To check a file you downloaded yourself, put it next to <span className="mono">SHA256SUMS.txt</span> and run{" "}
            <code>sha256sum -c SHA256SUMS.txt --ignore-missing</code> (on macOS, <code>shasum -a 256 -c SHA256SUMS.txt --ignore-missing</code>),
            or on Windows <code>Get-FileHash .\file -Algorithm SHA256</code> and compare it with the line in the file.
          </span>
        </div>
      </section>
    </Reveal>
  );
}
