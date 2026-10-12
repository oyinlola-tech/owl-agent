import { Component, useEffect, useState, type ReactNode } from "react";
import { readAppliedTheme } from "../../../../shared/hooks/themeMode.hook";

export function useIsDarkThemeApplied(): boolean {
  const [isDark, setIsDark] = useState(() => readAppliedTheme() === "dark");
  useEffect(() => {
    const observer = new MutationObserver(() => setIsDark(readAppliedTheme() === "dark"));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return isDark;
}

export class EditorErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <>{this.props.fallback}</>;
    return this.props.children;
  }
}

export function ReadOnlySourcePreview({ code }: { code: string }) {
  return (
    <pre className="fallback-code" aria-label="Source preview">
      {code.split("\n").map((line, index) => (
        <span key={index} className="ln"><i>{index + 1}</i><span>{line || " "}</span></span>
      ))}
    </pre>
  );
}

export function EditorSkeleton() {
  return (
    <div className="ed-skel" aria-label="Loading editor">
      {[62, 40, 78, 55, 30, 70, 46].map((width, index) => <span key={index} className="skel-line" style={{ width: `${width}%` }} />)}
    </div>
  );
}
