import { ArrowRight, FingerprintSimple, Prohibit, SealCheck, ShieldCheck, Timer } from "@phosphor-icons/react";
import { Reveal } from "../../components/reveal.component";
import { SiteLink } from "../../components/siteLink.component";
import "./trust.style.css";

export function SafetySection() {
  return (
    <section className="safety" id="safety">
      <div className="wrap safety-grid">
        <Reveal className="safety-copy">
          <span className="eyebrow">Approvals</span>
          <h2>An approval is a promise about one action.</h2>
          <p>
            When you approve, OWL stores a fingerprint of the exact tool and arguments. If the agent tries anything
            else, even a different flag, the approval does not match and the step stops.
          </p>
          <div className="safety-cols">
            <div><FingerprintSimple size={22} weight="duotone" /><b>Bound to the action</b><span>SHA-256 of the tool name and its arguments. Single use unless you approve for the whole task.</span></div>
            <div><Timer size={22} weight="duotone" /><b>Expires on its own</b><span>Unused approvals lapse after 30 minutes by default. Set OWL_APPROVAL_TTL to change it.</span></div>
            <div><Prohibit size={22} weight="duotone" /><b>Some things never run</b><span>sudo, su, doas, and runas are refused outright. Recursive deletes, installs, and curl are flagged high risk.</span></div>
          </div>
          <SiteLink className="safety-link" to="/security">How OWL keeps you in control <ArrowRight size={14} weight="bold" /></SiteLink>
        </Reveal>
        <Reveal className="safety-visual" delay={120}>
          <div className="receipt">
            <div className="rc-head"><span className="tile orange"><ShieldCheck size={16} weight="duotone" /></span><b>Run command</b><span className="tag tag-yellow">Medium risk</span></div>
            <div className="rc-cmd mono">$ go test ./... -run TestCheckout</div>
            <dl className="rc-props">
              <div><dt>Action</dt><dd className="mono">exec_run</dd></div>
              <div><dt>Folder</dt><dd className="mono">~/Projects/zudomart</dd></div>
              <div><dt>Reason</dt><dd>Verify the VAT rounding fix</dd></div>
              <div><dt>Args hash</dt><dd className="mono">9f2c…e41a</dd></div>
              <div><dt>Scope</dt><dd>Once</dd></div>
              <div><dt>Expires</dt><dd>in 29 min</dd></div>
            </dl>
            <div className="rc-row"><span className="fake-btn dark">Reject</span><span className="fake-btn go">Approve once</span></div>
            <div className="rc-stamp"><SealCheck size={16} weight="duotone" /> Consumed 10:24 · exit 0 · 0.81s</div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
