import { useEffect, useRef, useState } from "react";
import { ArrowRight, Brain, CaretDown, Cpu, Eye, GitDiff, Globe, List, Moon, ShieldCheck, Sun, X } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { OwlMark } from "../../shared/components/owlMark.component";
import { Tile, type Hue } from "../../shared/components/tag.component";
import { SiteLink } from "../components/siteLink.component";
import { OpenAppLink } from "../components/openApp.component";
import "./navbar.style.css";

const PRODUCT_LINKS: { icon: Icon; hue: Hue; title: string; description: string; to: string }[] = [
  { icon: Eye, hue: "blue", title: "How a task runs", description: "Read, plan, propose, approve", to: "/#how" },
  { icon: GitDiff, hue: "yellow", title: "Diff review", description: "Accept or reject each file", to: "/#features" },
  { icon: ShieldCheck, hue: "orange", title: "Approvals", description: "Bound to the exact action", to: "/#safety" },
  { icon: Globe, hue: "purple", title: "Browser Studio", description: "Preview at every width", to: "/#browser" },
  { icon: Brain, hue: "pink", title: "Memory", description: "Facts you can edit or turn off", to: "/#memory" },
  { icon: Cpu, hue: "green", title: "Model routing", description: "The right model per step", to: "/#routing" },
];

const PAGE_LINKS = [
  { to: "/docs", label: "Docs" },
  { to: "/security", label: "Security" },
  { to: "/changelog", label: "Changelog" },
  { to: "/download", label: "Download" },
];

function useScrolledPastTop() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const updateScrolled = () => setScrolled(window.scrollY > 8);
    updateScrolled();
    window.addEventListener("scroll", updateScrolled, { passive: true });
    return () => window.removeEventListener("scroll", updateScrolled);
  }, []);
  return scrolled;
}

export function Navbar({ path, theme, toggle }: { path: string; theme: "light" | "dark"; toggle: () => void }) {
  const [productMenuOpen, setProductMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const scrolled = useScrolledPastTop();
  const productMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!productMenuOpen && !mobileMenuOpen) return;
    const closeMenusOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setProductMenuOpen(false); setMobileMenuOpen(false); }
    };
    const closeProductMenuOnOutsideClick = (event: MouseEvent) => {
      if (productMenuOpen && productMenuRef.current && !productMenuRef.current.contains(event.target as Node)) setProductMenuOpen(false);
    };
    window.addEventListener("keydown", closeMenusOnEscape);
    window.addEventListener("mousedown", closeProductMenuOnOutsideClick);
    return () => {
      window.removeEventListener("keydown", closeMenusOnEscape);
      window.removeEventListener("mousedown", closeProductMenuOnOutsideClick);
    };
  }, [productMenuOpen, mobileMenuOpen]);

  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileMenuOpen]);

  useEffect(() => { setProductMenuOpen(false); setMobileMenuOpen(false); }, [path]);

  return (
    <>
      <nav className={`nav${scrolled ? " scrolled" : ""}`} aria-label="Main">
        <div className="wrap nav-inner">
          <SiteLink className="brand" to="/" aria-label="OWL home">
            <OwlMark size={26} />
            <span>OWL</span>
          </SiteLink>
          <div className="nav-links">
            <div className="nav-drop" ref={productMenuRef} onMouseLeave={() => setProductMenuOpen(false)}>
              <button className="nav-link" aria-expanded={productMenuOpen} aria-haspopup="true"
                onClick={() => setProductMenuOpen((open) => !open)} onMouseEnter={() => setProductMenuOpen(true)}>
                Product <CaretDown size={12} weight="bold" className={productMenuOpen ? "flip" : ""} />
              </button>
              {productMenuOpen && (
                <div className="drop">
                  <div className="drop-grid">
                    {PRODUCT_LINKS.map((link) => (
                      <SiteLink key={link.title} to={link.to} onClick={() => setProductMenuOpen(false)}>
                        <Tile icon={link.icon} hue={link.hue} />
                        <span><b>{link.title}</b><small>{link.description}</small></span>
                      </SiteLink>
                    ))}
                  </div>
                  <a className="drop-foot" href="/app">
                    Open the workspace <ArrowRight size={13} weight="bold" />
                  </a>
                </div>
              )}
            </div>
            {PAGE_LINKS.map((link) => (
              <SiteLink key={link.to} className="nav-link" to={link.to} aria-current={path === link.to ? "page" : undefined}>
                {link.label}
              </SiteLink>
            ))}
          </div>
          <div className="nav-right">
            <button className="btn btn-ghost btn-icon" onClick={toggle}
              aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}>
              {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
            </button>
            <OpenAppLink className="btn btn-dark btn-sm nav-open" label="Open app" arrowSize={13} />
            <button className="btn btn-ghost btn-icon nav-burger" onClick={() => setMobileMenuOpen(true)} aria-label="Open menu">
              <List size={18} />
            </button>
          </div>
        </div>
      </nav>
      {mobileMenuOpen && (
        <div className="msheet" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="msheet-top">
            <SiteLink className="brand" to="/" onClick={() => setMobileMenuOpen(false)}><OwlMark size={26} /><span>OWL</span></SiteLink>
            <button className="btn btn-ghost btn-icon" onClick={() => setMobileMenuOpen(false)} aria-label="Close menu"><X size={18} /></button>
          </div>
          <div className="msheet-list">
            {PRODUCT_LINKS.map((link) => (
              <SiteLink key={link.title} to={link.to} onClick={() => setMobileMenuOpen(false)}>
                <Tile icon={link.icon} hue={link.hue} /><span>{link.title}</span>
              </SiteLink>
            ))}
          </div>
          <div className="msheet-links">
            {PAGE_LINKS.map((link) => (
              <SiteLink key={link.to} to={link.to} onClick={() => setMobileMenuOpen(false)} aria-current={path === link.to ? "page" : undefined}>
                {link.label}
              </SiteLink>
            ))}
          </div>
          <OpenAppLink className="btn btn-dark btn-lg" label="Open app" onClick={() => setMobileMenuOpen(false)} />
        </div>
      )}
    </>
  );
}
