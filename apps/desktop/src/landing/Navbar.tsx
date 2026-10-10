import { useState } from "react";
import { Bird, CaretDown, List, X, Moon, Sun, SquaresFour, Eye, ShieldCheck, Terminal, Globe, ClockCounterClockwise } from "@phosphor-icons/react";

const DROP: { icon: typeof Eye; title: string; desc: string }[] = [
  { icon: SquaresFour, title: "Workspace", desc: "Chat, code, browser, preview" },
  { icon: Eye, title: "Activity", desc: "Every read and edit, listed" },
  { icon: ShieldCheck, title: "Approvals", desc: "Once, per task, or reject" },
  { icon: Terminal, title: "Terminal", desc: "User output kept separate" },
  { icon: Globe, title: "Recreation", desc: "Reference beside your build" },
  { icon: ClockCounterClockwise, title: "Checkpoints", desc: "Git backed restore points" },
];

const LINKS = [
  { href: "#workspace", label: "Workspace" },
  { href: "#recreation", label: "Recreation" },
  { href: "#features", label: "Features" },
];

export default function Navbar({ theme, toggle }: { theme: "light" | "dark"; toggle: () => void }) {
  const [drop, setDrop] = useState(false);
  const [mobile, setMobile] = useState(false);
  return (
    <>
      <div className="promo">
        <div className="wrap">
          <span>Runs locally on your machine. <a href="/app">Open the app</a></span>
        </div>
      </div>
      <nav className="nav">
        <div className="nav-inner">
          <a className="logo" href="#top" aria-label="OWL Agent home">
            <span className="logo-mark"><Bird size={18} weight="bold" /></span>
            <span>OWL AGENT<small>DEV WORKSPACE</small></span>
          </a>
          <div className="nav-links">
            <div onMouseLeave={() => setDrop(false)}>
              <a className="top" href="#features" onMouseEnter={() => setDrop(true)} onClick={() => setDrop((v) => !v)}>
                Product <CaretDown size={13} weight="bold" />
              </a>
              {drop && (
                <div className="drop">
                  {DROP.map((d) => (
                    <a key={d.title} href="#features" onClick={() => setDrop(false)}>
                      <span className="icon-tile soft"><d.icon size={17} /></span>
                      <span><b>{d.title}</b><span className="d">{d.desc}</span></span>
                    </a>
                  ))}
                </div>
              )}
            </div>
            {LINKS.map((l) => (
              <a key={l.href} className="top" href={l.href}>{l.label}</a>
            ))}
          </div>
          <div className="nav-right">
            <button className="theme-btn" onClick={toggle} aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}>
              {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
            </button>
            <a className="btn btn-primary" href="/app">Open App</a>
            <button className="theme-btn hamburger" onClick={() => setMobile(true)} aria-label="Open menu"><List size={16} /></button>
          </div>
        </div>
      </nav>
      {mobile && (
        <div className="mobile-menu">
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button className="theme-btn" onClick={() => setMobile(false)} aria-label="Close menu"><X size={16} /></button>
          </div>
          {[{ href: "#features", label: "Product" }, ...LINKS, { href: "/app", label: "Open App" }].map((l) => (
            <a key={l.href} href={l.href} onClick={() => setMobile(false)}>{l.label}</a>
          ))}
        </div>
      )}
    </>
  );
}
