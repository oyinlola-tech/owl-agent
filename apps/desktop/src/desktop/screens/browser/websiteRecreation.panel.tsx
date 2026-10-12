import { ArrowSquareOut, Check, Code, File, Globe, Images, MagicWand, Monitor, Play, Square, TextAa, TreeStructure, type Icon } from "@phosphor-icons/react";
import { useAppStore } from "../../state/app.store";
import { SectionTitle } from "../../../shared/components/pageLayout.component";
import { Tag, Tile } from "../../../shared/components/tag.component";

export type RecreationStage = "idle" | "analysis" | "built";

const ANALYSIS_STATS: [number, string, Icon][] = [
  [6, "Pages", File], [34, "Components", Square], [17, "Images", Images], [3, "Fonts", TextAa], [4, "Breakpoints", Monitor],
];

export function WebsiteRecreationPanel({ url, stage, onStageChange }: { url: string; stage: RecreationStage; onStageChange: (stage: RecreationStage) => void }) {
  const goToScreen = useAppStore((s) => s.goToScreen);
  const stepClass = (stepIndex: number) => (stepIndex === 0 ? (stage === "idle" ? "on" : "") : stepIndex === 1 ? (stage === "analysis" ? "on" : "") : stage === "built" ? "on" : "");
  return (
    <div>
      <SectionTitle>Website recreation</SectionTitle>
      <div className="pg-steps" style={{ marginTop: 0 }}>
        <div className={`pg-step ${stepClass(0)}`}>
          <div className="pg-step-head"><Tile icon={Globe} hue="blue" /><b>Reference</b><Tag hue="green" icon={Check}>Set</Tag></div>
          <p className="pg-mono" style={{ overflowWrap: "anywhere" }}>{url}</p>
          <p>Only public structure and responsive states are studied. No assets are copied.</p>
        </div>
        <div className={`pg-step ${stepClass(1)}`}>
          <div className="pg-step-head"><Tile icon={TreeStructure} hue="yellow" /><b>Analysis</b>
            {stage === "idle" ? <Tag>Not run</Tag> : <Tag hue="green" icon={Check}>Done</Tag>}</div>
          <p>Finds pages, components, fonts, and breakpoints.</p>
          <div className="row"><button className="btn btn-dark btn-sm" onClick={() => onStageChange("analysis")}><MagicWand size={14} /> Analyze</button></div>
        </div>
        <div className={`pg-step ${stepClass(2)}`}>
          <div className="pg-step-head"><Tile icon={Code} hue="green" /><b>Build</b>
            {stage === "built" ? <Tag hue="green" icon={Check}>Ready to review</Tag> : <Tag>Waiting</Tag>}</div>
          <p>{stage === "built" ? "Build complete. Review the changes in the workspace." : "Writes fresh code into your project, then waits for approval."}</p>
          <div className="row">
            {stage === "built"
              ? <button className="btn btn-primary btn-sm" onClick={() => goToScreen("workspace")}><ArrowSquareOut size={14} /> Review changes</button>
              : <button className="btn btn-primary btn-sm" disabled={stage !== "analysis"} onClick={() => onStageChange("built")}><Play size={14} /> Build implementation</button>}
          </div>
        </div>
      </div>
      {stage !== "idle" && (
        <div className="pg-stats">
          {ANALYSIS_STATS.map(([count, label, StatIcon], index) => (
            <div key={label} style={{ animationDelay: `${index * 50}ms` }}><b>{count}</b><span><StatIcon size={13} />{label}</span></div>
          ))}
        </div>
      )}
    </div>
  );
}
