import { useEffect, useState } from "react";
import { ArrowClockwise, ArrowLeft, ArrowRight, Desktop, DeviceMobile, DeviceTablet, Laptop, LockSimple, type Icon } from "@phosphor-icons/react";
import "./editor.style.css";

const VIEWPORT_PRESETS: { width: number; icon: Icon; label: string }[] = [
  { width: 1440, icon: Desktop, label: "Desktop" },
  { width: 1024, icon: Laptop, label: "Laptop" },
  { width: 768, icon: DeviceTablet, label: "Tablet" },
  { width: 390, icon: DeviceMobile, label: "Mobile" },
];

export function MiniBrowserPanel() {
  const [viewportWidth, setViewportWidth] = useState(1440);
  const [loading, setLoading] = useState(true);
  const [reloadCount, setReloadCount] = useState(0);
  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => setLoading(false), 700);
    return () => clearTimeout(timer);
  }, [viewportWidth, reloadCount]);
  return (
    <div className="mb">
      <div className="mb-bar">
        <span className="mb-nav">
          <button className="btn btn-ghost btn-icon btn-sm" aria-label="Back" disabled><ArrowLeft size={14} /></button>
          <button className="btn btn-ghost btn-icon btn-sm" aria-label="Forward" disabled><ArrowRight size={14} /></button>
          <button className="btn btn-ghost btn-icon btn-sm" aria-label="Reload" onClick={() => setReloadCount((count) => count + 1)}><ArrowClockwise size={14} /></button>
        </span>
        <span className="mb-url mono"><LockSimple size={12} weight="fill" /> Preview</span>
        <div className="seg" role="group" aria-label="Viewport width">
          {VIEWPORT_PRESETS.map((preset) => (
            <button key={preset.width} aria-pressed={viewportWidth === preset.width} onClick={() => setViewportWidth(preset.width)} title={`${preset.label} · ${preset.width}px`}>
              <preset.icon size={14} /> <span className="hide-s">{preset.width}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="mb-stage">
        <div className="mb-frame" style={{ maxWidth: viewportWidth }}>
          {loading ? (
            <div className="mb-skel" aria-label="Loading preview">
              <span className="skel-line" style={{ width: "30%", height: 14 }} />
              <span className="skel-line" style={{ width: "70%", height: 28, marginTop: 18 }} />
              <span className="skel-line" style={{ width: "52%" }} />
              <div className="mb-skel-grid">
                <span className="skel-line" /><span className="skel-line" /><span className="skel-line" />
              </div>
            </div>
          ) : (
            <div className="mb-page">
              <div className="mb-page-hero">
                <h3>No preview loaded</h3>
                <p>Open a local build to preview it here</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
