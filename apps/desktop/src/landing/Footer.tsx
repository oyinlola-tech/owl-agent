import { Bird } from "@phosphor-icons/react";

export default function Footer() {
  return (
    <footer className="footer">
      <div className="wrap">
        <h2 className="giant" aria-hidden="true">OWL AGENT</h2>
      </div>
      <div className="wrap footer-grid">
        <div className="footer-brand">
          <a className="logo" href="#top" aria-label="OWL Agent home">
            <span className="logo-mark"><Bird size={18} weight="bold" /></span>
            <span>OWL AGENT<small>DEV WORKSPACE</small></span>
          </a>
          <p>The local first workspace where you see what the AI does and approve each step.</p>
        </div>
        <div>
          <h6>PRODUCT</h6>
          <a href="#features">Features</a>
          <a href="#workspace">Workspace</a>
          <a href="#recreation">Recreation</a>
        </div>
        <div>
          <h6>APP</h6>
          <a href="/app">Open App</a>
          <a href="/app/tasks">Tasks</a>
          <a href="/app/browser">Browser Studio</a>
        </div>
        <div>
          <h6>MORE</h6>
          <a href="/app/projects">Projects</a>
          <a href="/app/settings">Settings</a>
        </div>
      </div>
      <div className="wrap footer-bottom">
        <span>© 2026 OWL Agent. Local first, always.</span>
        <span>Runs on your machine.</span>
      </div>
    </footer>
  );
}
