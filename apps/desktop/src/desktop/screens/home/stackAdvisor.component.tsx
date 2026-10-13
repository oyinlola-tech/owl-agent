import { useState } from "react";
import { Lightbulb, WarningCircle } from "@phosphor-icons/react";
import { agentApi } from "../../services/agentApi.service";
import type { StackRecommendation } from "../../services/agentApi.types";

interface StackAdvisorProps {
  onPick: (stackId: string) => void;
}

export function StackAdvisorComponent({ onPick }: StackAdvisorProps) {
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const [rankedBy, setRankedBy] = useState("");
  const [results, setResults] = useState<StackRecommendation[]>([]);
  const [searched, setSearched] = useState(false);

  const recommend = () => {
    const text = description.trim();
    if (!text || status === "loading") return;
    setStatus("loading");
    setError("");
    agentApi.recommendStack(text)
      .then((res) => {
        setRankedBy(res.ranked_by);
        setResults(res.recommendations);
        setSearched(true);
        setStatus("idle");
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Couldn't get recommendations.");
        setStatus("error");
      });
  };

  return (
    <section className="pg-advisor" aria-label="Stack advisor">
      <h3><Lightbulb size={15} /> Not sure which stack to use?</h3>
      <p className="side-note">Describe the project. OWL ranks known stacks and explains each pick.</p>
      <div className="input-wrap">
        <textarea
          className="input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. A small API with a Postgres database and a web dashboard"
          aria-label="Project description"
          rows={3}
        />
      </div>
      <button className="btn btn-secondary btn-sm" onClick={recommend} disabled={!description.trim() || status === "loading"}>
        {status === "loading" ? "Recommending…" : "Recommend a stack"}
      </button>
      {status === "error" ? (
        <p className="side-note" role="alert"><WarningCircle size={14} /> {error} <button className="btn btn-ghost btn-sm" onClick={recommend}>Retry</button></p>
      ) : searched && results.length === 0 && status === "idle" ? (
        <p className="side-note">No stacks matched that description. Try different words.</p>
      ) : results.length > 0 ? (
        <div className="pg-advisor-list">
          {rankedBy && <span className="side-note">Ranked by {rankedBy}.</span>}
          {results.map((rec) => (
            <article className="pg-advisor-card" key={rec.stack.id}>
              <div className="nmrow"><b>{rec.stack.name}</b><span className="side-note">fit {rec.fit_score}</span></div>
              <p>{rec.why}</p>
              {rec.tradeoffs.length > 0 && <span className="side-note">Tradeoffs: {rec.tradeoffs.join("; ")}</span>}
              <div><button className="btn btn-primary btn-sm" onClick={() => onPick(rec.stack.id)}>Pick {rec.stack.name}</button></div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
