import {
  CaretRight, FolderSimple, GitDiff, Kanban, ListChecks, MagnifyingGlass, Plus, ShieldCheck, Sparkle, TerminalWindow,
} from "@phosphor-icons/react";
import { OwlMark } from "../../../shared/components/owlMark.component";
import { Tag } from "../../../shared/components/tag.component";
import { Reveal } from "../../components/reveal.component";
import { SectionHeading } from "../sectionHeading.component";
import { SHOT_NAV, SHOT_TASKS, SHOT_TIMELINE } from "./productShot.data";
import "./productShot.style.css";

export function ProductShotSection() {
  return (
    <section className="section shot-sec" id="product">
      <div className="wrap">
        <SectionHeading center eyebrow="The workspace"
          title={<>One window for the whole job.</>}
          lede="Tasks, approvals, diffs, terminal, and memory share one event stream, so every panel shows what the agent is doing right now." />
      </div>
      <Reveal className="wrap-wide">
        <div className="shot" role="img" aria-label="The OWL app: a sidebar of sections, a table of six agent tasks with status and progress, and an activity timeline waiting for approval.">
          <div className="shot-bar">
            <span className="hd-lights"><i /><i /><i /></span>
            <span className="shot-crumb"><FolderSimple size={14} /> ZudoMart <CaretRight size={11} /> <Kanban size={14} /> <b>Tasks</b></span>
            <span className="shot-search"><MagnifyingGlass size={13} /> Search or run a command <kbd>Ctrl</kbd><kbd>⇧</kbd><kbd>P</kbd></span>
            <span className="shot-pill"><span className="live-dot pulse" />Needs approval</span>
            <span className="shot-new"><Plus size={13} weight="bold" /> New task</span>
          </div>
          <div className="shot-grid">
            <aside className="shot-side">
              <div className="shot-ws"><OwlMark size={22} /><span><b>ZudoMart</b><small>~/Projects/zudomart</small></span></div>
              {SHOT_NAV.map((navGroup) => (
                <div key={navGroup.group || "main"} className="shot-group">
                  {navGroup.group && <div className="shot-gh">{navGroup.group}</div>}
                  {navGroup.items.map((navItem) => (
                    <div key={navItem.label} className={`shot-nav${navItem.on ? " on" : ""}`}>
                      <navItem.icon size={16} weight={navItem.on ? "fill" : "regular"} />{navItem.label}
                      {navItem.badge && <span className="shot-badge">{navItem.badge}</span>}
                    </div>
                  ))}
                </div>
              ))}
            </aside>
            <div className="shot-main">
              <div className="shot-h">
                <span className="tile blue tile-lg"><ListChecks size={20} weight="duotone" /></span>
                <div><h3>Tasks</h3><p>Running and past agent work across your projects.</p></div>
              </div>
              <div className="shot-filters">
                <span className="seg"><button className="on">All <i>6</i></button><button>Running <i>1</i></button><button>Needs approval <i>1</i></button><button>Completed <i>2</i></button></span>
              </div>
              <div className="shot-table">
                <div className="st-row st-head"><span>Name</span><span>Project</span><span>Status</span><span>Progress</span><span>Started</span></div>
                {SHOT_TASKS.map((task) => (
                  <div key={task.name} className={`st-row${task.status.hue === "orange" ? " hot" : ""}`}>
                    <span className="st-name"><b>{task.name}</b><small>{task.note}</small></span>
                    <span><span className="tag">{task.project}</span></span>
                    <span><span className={`tag tag-${task.status.hue}`}><span className={`live-dot${task.status.pulse ? " pulse" : ""}`} style={{ width: 6, height: 6 }} />{task.status.label}</span></span>
                    <span className="st-prog"><span className={`progress${task.status.hue === "green" ? " green" : task.status.hue === "red" ? " red" : task.status.hue === "orange" ? " orange" : ""}`}><i style={{ width: `${task.p}%` }} /></span><em>{task.p}%</em></span>
                    <span className="st-when">{task.when}</span>
                  </div>
                ))}
              </div>
            </div>
            <aside className="shot-insp">
              <div className="shot-itabs"><span className="on"><Sparkle size={13} weight="fill" /> Activity</span><span><ShieldCheck size={13} /> 2</span><span><GitDiff size={13} /> 3</span></div>
              <ol className="shot-tl">
                {SHOT_TIMELINE.map((event) => (
                  <li key={event.t} className={event.state}>
                    <span className={`tile ${event.state === "wait" ? "gray" : event.hue}`}><event.icon size={14} weight="duotone" /></span>
                    <span><b>{event.t}</b><small className={event.icon === TerminalWindow || event.icon === MagnifyingGlass ? "mono" : ""}>{event.d}</small></span>
                  </li>
                ))}
              </ol>
              <div className="shot-appr">
                <div className="shot-appr-h"><b>Write 3 files</b><Tag hue="green">Low risk</Tag></div>
                <code>src/auth/service.go +2</code>
                <div className="shot-appr-row"><span className="fake-btn">Reject</span><span className="fake-btn go">Approve</span></div>
              </div>
            </aside>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
