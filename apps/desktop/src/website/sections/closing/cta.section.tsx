import { OwlMark } from "../../../shared/components/owlMark.component";
import { Reveal } from "../../components/reveal.component";
import { SiteLink } from "../../components/siteLink.component";
import { OpenAppLink } from "../../components/openApp.component";
import "./closing.style.css";

export function ClosingCtaSection() {
  return (
    <section className="section cta-sec">
      <div className="wrap">
        <Reveal className="cta">
          <OwlMark size={44} />
          <h2>Give the agent a task. Keep the last word.</h2>
          <p>Open the workspace, point it at a project, and watch it read, plan, and wait for you.</p>
          <div className="hero-cta">
            <OpenAppLink className="btn btn-dark btn-lg" label="Open the app" arrowSize={16} />
            <SiteLink className="btn btn-secondary btn-lg" to="/download">Download</SiteLink>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
