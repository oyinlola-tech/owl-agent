import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowClockwise, ArrowDown, ArrowUp, ChatCircleText, Code, Cpu, Eye, Lightning, ListChecks, Path,
  SealCheck, Stack, Sparkle, Bug, TextAlignLeft, WarningCircle, type Icon,
} from "@phosphor-icons/react";
import { useAppStore } from "../../../state/app.store";
import { agentApi } from "../../../services/agentApi.service";
import { type BackendTask, type ModelEntry, type RouteRead, type UsageRow } from "../../../services/agentApi.types";
import { SAMPLE_MODELS } from "../../../services/samples/sampleCatalog.data";
import { SAMPLE_BACKEND_TASKS, SAMPLE_USAGE } from "../../../services/samples/sampleTasks.data";
import { loadWithSampleFallback, SAMPLE_SAVE_NOTICE_SHORT } from "../../../services/samples/sampleMode.helper";
import { SampleDataBanner, EmptyState, PageHeader, SectionTitle } from "../../../../shared/components/pageLayout.component";
import { Tag, type Hue } from "../../../../shared/components/tag.component";
import "./modelsUsage.style.css";
import { StatCard } from "../../../components/statCard.component";
import { formatRelativeTime, formatTokenCount } from "../../../../shared/helpers/time.helper";

const MODEL_STATUS_HUE: Record<ModelEntry["status"], Hue> = {
  verified: "green", available: "blue", untested: "gray", unavailable: "red", deprecated: "brown",
};

const ROUTING_CATEGORIES: { id: string; label: string; icon: Icon; needs: string[]; when: string }[] = [
  { id: "chat", label: "Chat", icon: ChatCircleText, needs: ["chat"], when: "Questions and conversation with no stronger signal." },
  { id: "plan", label: "Plan", icon: ListChecks, needs: ["chat", "reasoning"], when: "\"plan\", \"design\", \"approach\", \"roadmap\"" },
  { id: "code", label: "Code", icon: Code, needs: ["chat", "code"], when: "\"implement\", \"refactor\", \"write\", \"function\", \"api\"" },
  { id: "debug", label: "Debug", icon: Bug, needs: ["chat", "code", "reasoning"], when: "\"fix\", \"error\", \"failing\", \"traceback\"" },
  { id: "big_context", label: "Big context", icon: Stack, needs: ["chat", "long-context"], when: "\"codebase\", \"repository\", \"across\", \"all files\"" },
  { id: "summarize", label: "Summarize", icon: TextAlignLeft, needs: ["chat"], when: "\"summarise\", \"recap\", \"tldr\"" },
  { id: "multimodal", label: "Multimodal", icon: Eye, needs: ["chat", "vision"], when: "\"screenshot\", \"image\", \"diagram\"" },
];

const formatContextWindow = (tokens: number | null) =>
  tokens === null ? "Unknown" : tokens < 1000 ? String(tokens) : `${tokens % 1000 === 0 ? tokens / 1000 : Math.round(tokens / 1024)}k`;
const shortModelName = (id: string) => id.split("/").pop() ?? id;

export function ModelsUsageScreen() {
  const showNotice = useAppStore((s) => s.showNotice);
  const openBackendTask = useAppStore((s) => s.openBackendTask);
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [tasksById, setTasksById] = useState<Record<string, BackendTask>>({});
  const [isSampleData, setIsSampleData] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [validationById, setValidationById] = useState<Record<string, { busy?: boolean; status?: string; error?: string }>>({});
  const [prompt, setPrompt] = useState("Fix the failing checkout test");
  const [routeResult, setRouteResult] = useState<RouteRead | { error: string } | null>(null);
  const [routing, setRouting] = useState(false);

  const loadModelsAndUsage = useCallback(async () => {
    setLoading(true);
    const [registryResult, usageResult, taskResult] = await Promise.all([
      loadWithSampleFallback(agentApi.registry(), { models: SAMPLE_MODELS }),
      loadWithSampleFallback(agentApi.usage(), SAMPLE_USAGE),
      loadWithSampleFallback(agentApi.backendTasks(), SAMPLE_BACKEND_TASKS),
    ]);
    setTasksById(Object.fromEntries(taskResult.data.map((task) => [task.id, task])));
    setModels(registryResult.data.models);
    setUsage(usageResult.data);
    setIsSampleData(registryResult.demo || usageResult.demo);
    setLoading(false);
  }, []);
  useEffect(() => { void loadModelsAndUsage(); }, [loadModelsAndUsage]);

  const usageTotals = useMemo(() => {
    const summary = { input: 0, output: 0, calls: usage.length, failed: 0 };
    usage.forEach((call) => { summary.input += call.input_tokens; summary.output += call.output_tokens; if (call.error) summary.failed += 1; });
    return summary;
  }, [usage]);

  const tokensByTask = useMemo(() => {
    const totalsByTask = new Map<string, { input: number; output: number; calls: number; models: Set<string> }>();
    usage.forEach((call) => {
      const taskTotals = totalsByTask.get(call.task_id) ?? { input: 0, output: 0, calls: 0, models: new Set<string>() };
      taskTotals.input += call.input_tokens; taskTotals.output += call.output_tokens; taskTotals.calls += 1; taskTotals.models.add(shortModelName(call.model));
      totalsByTask.set(call.task_id, taskTotals);
    });
    return [...totalsByTask.entries()].map(([task, taskTotals]) => ({ task, ...taskTotals })).sort((a, b) => b.input + b.output - (a.input + a.output)).slice(0, 8);
  }, [usage]);
  const maxTaskTokens = Math.max(1, ...tokensByTask.map((taskTotals) => taskTotals.input + taskTotals.output));

  const refreshRegistry = async () => {
    if (isSampleData) { showNotice(SAMPLE_SAVE_NOTICE_SHORT); return; }
    setRefreshing(true);
    try {
      const result = await agentApi.refreshRegistry();
      showNotice(`Registry refreshed: ${result.added} added, ${result.deprecated} deprecated, ${result.total} total`);
      await loadModelsAndUsage();
    } catch (e) {
      showNotice(e instanceof Error ? `Refresh failed: ${e.message}` : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  };

  const validateModel = async (id: string) => {
    if (isSampleData) { showNotice(SAMPLE_SAVE_NOTICE_SHORT); return; }
    setValidationById((current) => ({ ...current, [id]: { busy: true } }));
    try {
      const result = await agentApi.validateModel(id);
      setValidationById((current) => ({ ...current, [id]: { status: result.status, error: result.error } }));
      showNotice(result.error ? `${shortModelName(id)}: ${result.error}` : `${shortModelName(id)} is ${result.status}`);
      if (!result.error) setModels((current) => current.map((model) => (model.id === id ? { ...model, status: result.status as ModelEntry["status"] } : model)));
    } catch (e) {
      setValidationById((current) => ({ ...current, [id]: { error: e instanceof Error ? e.message : "Unreachable" } }));
    }
  };

  const routePrompt = async () => {
    if (!prompt.trim()) return;
    setRouting(true);
    try {
      setRouteResult(await agentApi.route(prompt.trim()));
    } catch {
      setRouteResult({ error: "The router runs inside the OWL service. Start the service to see which model it would pick and why." });
    } finally {
      setRouting(false);
    }
  };

  return (
    <div className="page x-models">
      <PageHeader
        icon={Cpu} hue="blue" title="Models & usage"
        lede="Which models OWL can call, how it picks one for each task, and what every call cost in tokens."
        actions={<button className="btn btn-secondary" onClick={() => void refreshRegistry()} disabled={refreshing || loading}>
          <ArrowClockwise size={15} /> {refreshing ? "Refreshing…" : "Refresh registry"}
        </button>}
      />
      {isSampleData && <SampleDataBanner what="this page" onRetry={() => void loadModelsAndUsage()} />}

      <div className="x-stats">
        <StatCard icon={ArrowUp} hue="blue" label="Tokens sent" value={formatTokenCount(usageTotals.input)} sub="Prompts and context" />
        <StatCard icon={ArrowDown} hue="purple" label="Tokens received" value={formatTokenCount(usageTotals.output)} sub="Model replies" />
        <StatCard icon={Lightning} hue="green" label="Model calls" value={String(usageTotals.calls)} sub="Last 100 recorded" />
        <StatCard icon={WarningCircle} hue={usageTotals.failed ? "red" : "gray"} label="Failed calls" value={String(usageTotals.failed)}
          sub={usageTotals.calls ? `${Math.round((usageTotals.failed / usageTotals.calls) * 100)}% of calls` : "No calls yet"} />
      </div>

      <div className="x-split">
        <section className="surface x-panel">
          <div className="x-panel-head">
            <h3>Tokens by task</h3>
            <span className="x-legend"><i className="in" /> Sent <i className="out" /> Received</span>
          </div>
          {tokensByTask.length === 0 ? <p className="x-muted">No model calls recorded yet.</p> : (
            <>
              <div className="x-bars" role="img" aria-label={tokensByTask.map((taskTotals) => `${tasksById[taskTotals.task]?.prompt ?? taskTotals.task}: ${taskTotals.input} sent, ${taskTotals.output} received`).join("; ")}>
                {tokensByTask.map((taskTotals) => (
                  <button key={taskTotals.task} className="x-bar-row" onClick={() => openBackendTask(taskTotals.task)} title={tasksById[taskTotals.task]?.prompt ?? taskTotals.task}>
                    <div className="x-bar-label">
                      <span className="x-bar-name">{tasksById[taskTotals.task]?.prompt ?? taskTotals.task}</span>
                      <span>{taskTotals.calls} {taskTotals.calls === 1 ? "call" : "calls"} · {[...taskTotals.models].join(", ")}</span>
                    </div>
                    <div className="x-bar-track">
                      <span className="in" style={{ width: `${(taskTotals.input / maxTaskTokens) * 100}%` }} />
                      <span className="out" style={{ width: `${(taskTotals.output / maxTaskTokens) * 100}%` }} />
                    </div>
                    <div className="x-bar-val">{formatTokenCount(taskTotals.input + taskTotals.output)}</div>
                  </button>
                ))}
              </div>
              <div className="sr-only"><table>
                <caption>Tokens by task</caption>
                <thead><tr><th>Task</th><th>Sent</th><th>Received</th><th>Calls</th></tr></thead>
                <tbody>{tokensByTask.map((taskTotals) => <tr key={taskTotals.task}><td>{tasksById[taskTotals.task]?.prompt ?? taskTotals.task}</td><td>{taskTotals.input}</td><td>{taskTotals.output}</td><td>{taskTotals.calls}</td></tr>)}</tbody>
              </table></div>
            </>
          )}
        </section>

        <section className="surface x-panel">
          <div className="x-panel-head"><h3>Try the router</h3><Tag hue="blue" icon={Sparkle}>Auto</Tag></div>
          <p className="x-muted">Type a task. OWL classifies it, then picks the smallest available model with the capabilities it needs.</p>
          <form className="x-route-form" onSubmit={(e) => { e.preventDefault(); void routePrompt(); }}>
            <input className="input" value={prompt} onChange={(e) => setPrompt(e.target.value)} aria-label="Task to route" placeholder="Describe a task" />
            <button className="btn btn-dark" disabled={routing || !prompt.trim()}><Path size={15} /> {routing ? "Routing…" : "Route"}</button>
          </form>
          {routeResult && ("error" in routeResult
            ? <div className="callout"><WarningCircle size={16} />{routeResult.error}</div>
            : (
              <div className="x-route-out">
                <div><span className="x-muted">Category</span><Tag hue="purple">{routeResult.category}</Tag></div>
                <div><span className="x-muted">Model</span><span className="mono">{routeResult.model}</span></div>
                <p>{routeResult.reason}</p>
              </div>
            ))}
        </section>
      </div>

      <SectionTitle count={models.length}>Model registry</SectionTitle>
      {!loading && models.length === 0 ? (
        <EmptyState icon={Cpu} hue="blue" title="No models registered" body="Refresh the registry to pull the model list from your provider.">
          <button className="btn btn-secondary" onClick={() => void refreshRegistry()}>Refresh registry</button>
        </EmptyState>
      ) : (
        <div className="x-table-wrap">
          <table className="x-table">
            <thead><tr><th>Model</th><th>Capabilities</th><th>Context</th><th>Status</th><th>Last seen</th><th aria-label="Actions" /></tr></thead>
            <tbody>
              {models.map((model) => {
                const validation = validationById[model.id];
                return (
                  <tr key={model.id}>
                    <td data-label="Model"><span className="mono x-model-id" title={model.id}>{model.id}</span></td>
                    <td data-label="Capabilities"><span className="x-tags">{model.capabilities.map((cap) => <Tag key={cap} hue="gray">{cap}</Tag>)}</span></td>
                    <td data-label="Context" className="x-num" title={`Source: ${model.context_source}`}>{formatContextWindow(model.context_window)}</td>
                    <td data-label="Status">
                      <Tag hue={MODEL_STATUS_HUE[model.status]} icon={model.status === "verified" ? SealCheck : undefined} dot={model.status !== "verified"}>{model.status}</Tag>
                      {validation?.error && <div className="x-err-text">{validation.error}</div>}
                    </td>
                    <td data-label="Last seen" className="x-num">{formatRelativeTime(model.last_seen)}</td>
                    <td className="x-row-acts">
                      <button className="btn btn-sm btn-secondary" onClick={() => void validateModel(model.id)} disabled={validation?.busy || model.status === "deprecated"}>
                        {validation?.busy ? "Checking…" : "Validate"}
                      </button>
                      <button className="btn btn-sm btn-ghost" onClick={() => showNotice("Set OWL_ROUTER_DEFAULT_MODEL in the service environment, then restart it")}>
                        Use as default
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <SectionTitle>How routing decides</SectionTitle>
      <div className="x-cats">
        {ROUTING_CATEGORIES.map((category) => (
          <div key={category.id} className="x-cat">
            <span className="x-cat-name"><span className="tile purple"><category.icon size={15} weight="duotone" /></span><b>{category.label}</b></span>
            <span className="x-cat-when">{category.when}</span>
            <span className="x-tags">{category.needs.map((capability) => <Tag key={capability} hue="gray">{capability}</Tag>)}</span>
          </div>
        ))}
      </div>

      <SectionTitle count={usage.length}>Recent model calls</SectionTitle>
      {usage.length === 0 ? <p className="x-muted">No calls recorded yet. Run a task to see usage here.</p> : (
        <div className="x-table-wrap">
          <table className="x-table">
            <thead><tr><th>When</th><th>Task</th><th>Model</th><th className="x-r">Sent</th><th className="x-r">Received</th><th className="x-r">Time</th><th>Result</th></tr></thead>
            <tbody>
              {usage.slice(0, 25).map((call) => (
                <tr key={call.id}>
                  <td data-label="When" className="x-num">{formatRelativeTime(call.created_at)}</td>
                  <td data-label="Task"><button className="x-link mono" onClick={() => openBackendTask(call.task_id)}>{call.task_id}</button></td>
                  <td data-label="Model"><span className="mono x-ellipsis" title={`${call.model} · ${call.routing_reason}`}>{shortModelName(call.model)}</span></td>
                  <td data-label="Sent" className="x-num x-r">{call.input_tokens.toLocaleString()}</td>
                  <td data-label="Received" className="x-num x-r">{call.output_tokens.toLocaleString()}{call.estimated ? <span className="x-muted" title="Estimated"> ~</span> : ""}</td>
                  <td data-label="Time" className="x-num x-r">{(call.duration_ms / 1000).toFixed(1)}s</td>
                  <td data-label="Result">
                    {call.error ? <Tag hue="red" dot>{call.error}</Tag> : <Tag hue="green" dot>OK</Tag>}
                    {call.retries > 0 && <span className="x-muted"> · {call.retries} {call.retries === 1 ? "retry" : "retries"}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
