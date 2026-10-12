import { useCallback, useEffect, useState } from "react";
import { ArrowClockwise, ArrowSquareOut, CheckCircle, FolderSimple, Tray } from "@phosphor-icons/react";
import { useAppStore } from "../../state/app.store";
import { usePendingApprovalsStore } from "../../state/pendingApprovals.store";
import { agentApi } from "../../services/agentApi.service";
import { EmptyState, PageHeader } from "../../../shared/components/pageLayout.component";
import { StatusTag } from "../../../shared/components/statusTag.component";
import { Tag } from "../../../shared/components/tag.component";
import { isTypingInTextField } from "../../../shared/helpers/keyboard.helper";
import { ApprovalCard } from "./approvalCard.component";
import { useInboxApprovals } from "./inboxApprovals.hook";
import type { InboxItem, InboxView } from "./inboxApproval.types";
import "./inbox.style.css";

export function InboxScreen() {
  const showNotice = useAppStore((s) => s.showNotice);
  const askForConfirmation = useAppStore((s) => s.askForConfirmation);
  const openBackendTask = useAppStore((s) => s.openBackendTask);
  const goToScreen = useAppStore((s) => s.goToScreen);
  const markDecided = usePendingApprovalsStore((s) => s.markDecided);
  const { groups, loading, failure, loadApprovals } = useInboxApprovals();
  const [view, setView] = useState<InboxView>("pending");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(intervalId);
  }, []);

  const allItems = groups.flatMap((group) => group.items);
  const pendingCount = allItems.filter((item) => item.status === "pending").length;
  const decidedCount = allItems.length - pendingCount;
  const matchesView = (item: InboxItem) => (view === "all" ? true : view === "pending" ? item.status === "pending" : item.status !== "pending");
  const visibleGroups = groups.map((group) => ({ ...group, items: group.items.filter(matchesView) })).filter((group) => group.items.length > 0);
  const actionableItems = visibleGroups.flatMap((group) => group.items).filter((item) => item.status === "pending");
  const selectedKey = actionableItems[Math.min(selectedIndex, actionableItems.length - 1)]?.key;

  const decideItem = useCallback(async (item: InboxItem, approved: boolean) => {
    const verb = approved ? "Approved" : "Rejected";
    try {
      await agentApi.decide(item.taskId, item.id, approved);
      markDecided(item.key, { status: approved ? "approved" : "rejected", at: new Date().toISOString() });
      showNotice(`${verb}: ${item.title}`);
    } catch (e) {
      showNotice(e instanceof Error ? `Couldn't record the decision: ${e.message}` : "Couldn't reach the OWL service");
    }
  }, [showNotice, markDecided]);

  const lowRiskPending = allItems.filter((item) => item.status === "pending" && item.risk === "Low");
  const approveAllLowRisk = () => askForConfirmation({
    title: `Approve ${lowRiskPending.length} low-risk ${lowRiskPending.length === 1 ? "request" : "requests"}?`,
    body: `${lowRiskPending.map((item) => item.title).join(", ")}. Medium and high risk requests stay in your inbox.`,
    confirmLabel: "Approve all",
    run: () => { lowRiskPending.forEach((item) => void decideItem(item, true)); },
  });

  useEffect(() => {
    const handleInboxKey = (e: KeyboardEvent) => {
      if (isTypingInTextField(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (useAppStore.getState().confirm || useAppStore.getState().commandPaletteOpen) return;
      const currentIndex = actionableItems.findIndex((item) => item.key === selectedKey);
      if (e.key === "j") { e.preventDefault(); setSelectedIndex(Math.min(actionableItems.length - 1, currentIndex + 1)); }
      else if (e.key === "k") { e.preventDefault(); setSelectedIndex(Math.max(0, currentIndex - 1)); }
      else if ((e.key === "a" || e.key === "r") && currentIndex >= 0) { e.preventDefault(); void decideItem(actionableItems[currentIndex], e.key === "a"); }
    };
    window.addEventListener("keydown", handleInboxKey);
    return () => window.removeEventListener("keydown", handleInboxKey);
  }, [actionableItems, selectedKey, decideItem]);

  useEffect(() => {
    if (!selectedKey) return;
    document.getElementById(`x-ap-${selectedKey}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedKey]);

  return (
    <div className="page x-inbox">
      <PageHeader
        icon={Tray} hue="orange" title="Inbox"
        lede="Everything OWL is waiting on you for. Nothing below runs, writes, or pushes until you decide."
        actions={<>
          <button className="btn btn-secondary" onClick={() => void loadApprovals()} disabled={loading}>
            <ArrowClockwise size={15} /> Refresh
          </button>
          <button className="btn btn-primary" onClick={approveAllLowRisk} disabled={lowRiskPending.length === 0}>
            <CheckCircle size={15} weight="bold" /> Approve all low-risk{lowRiskPending.length > 0 ? ` (${lowRiskPending.length})` : ""}
          </button>
        </>}
      />
      {!loading && failure !== "none" && (
        <EmptyState icon={Tray} hue={failure === "unauthorized" ? "orange" : "red"}
          title={failure === "unauthorized" ? "Sign in to the local service" : "OWL's local service isn't running"}
          body={failure === "unauthorized" ? "The desktop app couldn't authenticate with the local service." : "Start the OWL service to see what's waiting on you."}>
          <button className="btn btn-secondary" onClick={() => void loadApprovals()}><ArrowClockwise size={15} /> Retry</button>
        </EmptyState>
      )}

      <div className="x-toolbar">
        <div className="seg" role="tablist" aria-label="Show approvals">
          {([["pending", "Pending", pendingCount], ["decided", "Decided", decidedCount], ["all", "All", allItems.length]] as const).map(([viewId, label, count]) => (
            <button key={viewId} role="tab" aria-selected={view === viewId} onClick={() => { setView(viewId); setSelectedIndex(0); }}>
              {label} <span className="x-count">{count}</span>
            </button>
          ))}
        </div>
        <div className="x-keys hide-m" aria-label="Keyboard shortcuts">
          <kbd>J</kbd><kbd>K</kbd> move <kbd>A</kbd> approve <kbd>R</kbd> reject
        </div>
      </div>

      {loading && (
        <div className="x-skel">
          {[0, 1, 2].map((index) => <div key={index} className="x-skel-card"><span className="skel-line" style={{ width: "40%" }} /><span className="skel-line" style={{ width: "75%" }} /><span className="skel-line" style={{ width: "55%" }} /></div>)}
        </div>
      )}

      {!loading && failure === "none" && visibleGroups.length === 0 && (
        <EmptyState icon={CheckCircle} hue="green" title={view === "decided" ? "No decisions yet" : "You're all caught up"}
          body={view === "decided"
            ? "Approvals you accept or reject show up here with who decided and when."
            : "When OWL wants to write files, run a command, or push, the request lands here first."}>
          <button className="btn btn-secondary" onClick={() => goToScreen("workspace")}>Open workspace</button>
          <button className="btn btn-secondary" onClick={() => goToScreen("tasks")}>View tasks</button>
        </EmptyState>
      )}

      {!loading && visibleGroups.map((group) => (
        <section key={group.taskId} className="x-group" aria-label={group.title}>
          <header className="x-group-head">
            <div className="x-group-title">
              <b title={group.title}>{group.title}</b>
              <span className="x-group-meta">
                <Tag hue="gray" icon={FolderSimple}>{group.project || "No project"}</Tag>
                <StatusTag status={group.status} />
                {group.source === "backend" && <span className="x-mono-dim">{group.taskId}</span>}
              </span>
            </div>
            <button className="btn btn-sm btn-ghost"
              onClick={() => (group.source === "local" ? goToScreen("workspace") : openBackendTask(group.taskId))}>
              Open task <ArrowSquareOut size={14} />
            </button>
          </header>
          <div className="x-cards">
            {group.items.map((item) => (
              <ApprovalCard
                key={item.key}
                item={item}
                isSelected={item.key === selectedKey}
                now={now}
                onSelect={() => {
                  const actionableIndex = actionableItems.findIndex((actionable) => actionable.key === item.key);
                  if (actionableIndex >= 0) setSelectedIndex(actionableIndex);
                }}
                onDecide={(approved) => void decideItem(item, approved)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
