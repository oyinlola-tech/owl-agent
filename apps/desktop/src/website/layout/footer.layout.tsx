import { OwlMark } from "../../shared/components/owlMark.component";
import { SiteLink } from "../components/siteLink.component";
import { OpenAppLink, WebsiteDownloadLink, openAppLabel } from "../components/openApp.component";
import "./footer.style.css";
import { PROJECT_AUTHOR } from "../../shared/data/projectAuthor.data";

const FOOTER_COLUMNS = [
  { heading: "Product", links: [
    { to: "/#how", label: "How a task runs" },
    { to: "/#features", label: "Diff review" },
    { to: "/#safety", label: "Approvals" },
    { to: "/#browser", label: "Browser Studio" },
    { to: "/#memory", label: "Memory" },
    { to: "/#routing", label: "Model routing" },
  ] },
  { heading: "Resources", links: [
    { to: "/docs", label: "Documentation" },
    { to: "/docs#api", label: "API reference" },
    { to: "/docs#shortcuts", label: "Keyboard shortcuts" },
    { to: "/security", label: "Security" },
    { to: "/changelog", label: "Changelog" },
    { to: "/download", label: "Download" },
  ] },
  { heading: "App", links: [
    { to: "/app", label: "Open the app" },
    { to: "/app/tasks", label: "Tasks" },
    { to: "/app/inbox", label: "Inbox" },
    { to: "/app/playbooks", label: "Playbooks" },
    { to: "/app/models", label: "Models & usage" },
    { to: "/app/help", label: "Help" },
  ] },
];

export function Footer() {
  return (
    <footer className="footer">
      <div className="wrap footer-grid">
        <div className="footer-brand">
          <SiteLink className="brand" to="/" aria-label="OWL home"><OwlMark size={26} /><span>OWL</span></SiteLink>
          <p>A local-first workspace where an AI agent shows its work and waits for your approval.</p>
          <OpenAppLink className="btn btn-secondary btn-sm" label="Open the app" arrowSize={13} />
          <WebsiteDownloadLink className="btn btn-ghost btn-sm" />
        </div>
        {FOOTER_COLUMNS.map((column) => (
          <nav key={column.heading} aria-label={column.heading}>
            <h6>{column.heading}</h6>
            {column.links.map((link) => (
              <SiteLink key={link.to} to={link.to}>{link.to === "/app" ? openAppLabel(link.label) : link.label}</SiteLink>
            ))}
          </nav>
        ))}
      </div>
      <div className="wrap footer-word" aria-hidden="true">OWL</div>
      <div className="wrap footer-bottom">
        <span>
          © 2026 OWL Agent · v0.1.0 · Built by{" "}
          <a href={PROJECT_AUTHOR.website} target="_blank" rel="noopener noreferrer">{PROJECT_AUTHOR.name}</a>
          {" "}· <SiteLink to="/docs">GPL-3.0</SiteLink>
        </span>
        <span>Runs on your machine. Talks only to the model you configure.</span>
      </div>
    </footer>
  );
}
