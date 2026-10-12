import { BookOpenText, House, Rocket } from "@phosphor-icons/react";
import { OwlMark } from "../../shared/components/owlMark.component";
import { SiteLink } from "../components/siteLink.component";
import { openAppLabel } from "../components/openApp.component";
import "./notFound.style.css";

export function NotFoundPage({ path }: { path: string }) {
  return (
    <section className="nf">
      <div className="wrap nf-inner">
        <div className="nf-mark"><OwlMark size={72} /></div>
        <span className="eyebrow">404</span>
        <h1>This page doesn't exist.</h1>
        <p>Nothing lives at <code>{path}</code>. It may have moved, or the link has a typo.</p>
        <div className="nf-links">
          <SiteLink className="nf-link" to="/"><House size={20} weight="duotone" /><span><b>Home</b><small>What OWL does</small></span></SiteLink>
          <SiteLink className="nf-link" to="/docs"><BookOpenText size={20} weight="duotone" /><span><b>Docs</b><small>Setup and concepts</small></span></SiteLink>
          <a className="nf-link" href="/app"><Rocket size={20} weight="duotone" /><span><b>{openAppLabel("Open the app")}</b><small>Start a task</small></span></a>
        </div>
      </div>
    </section>
  );
}
