import { ArrowSquareOut, Bell, CaretRight, Check, CheckCircle, ShieldCheck, Tray, X } from "@phosphor-icons/react";
import { useAppStore } from "../../state/app.store";
import { usePendingApprovalCount } from "../../state/pendingApprovals.store";
import { Popover, usePopover } from "../../components/popover.component";

export function InboxBell() {
  const approvals = useAppStore((s) => s.approvals);
  const decideApproval = useAppStore((s) => s.decideApproval);
  const goToScreen = useAppStore((s) => s.goToScreen);
  const setCenterTab = useAppStore((s) => s.setCenterTab);
  const pendingApprovals = approvals.filter((approval) => approval.status === "pending");
  const totalPending = usePendingApprovalCount();
  const backendPending = totalPending - pendingApprovals.length;
  const popover = usePopover("bottom-end");
  return (
    <>
      <button ref={popover.trigger} className="btn btn-ghost btn-icon tb-bell" onClick={popover.toggle} aria-haspopup="dialog" aria-expanded={popover.open}
        aria-label={totalPending ? `Inbox, ${totalPending} approvals waiting` : "Inbox"} title="Inbox">
        <Bell size={17} weight={totalPending ? "fill" : "regular"} />
        {totalPending > 0 && <span className="tb-badge">{totalPending}</span>}
      </button>
      <Popover popover={popover} label="Approvals inbox" className="pop-inbox">
        <div className="pop-head">
          <b>Waiting for you</b>
          <span className="pop-aside">{totalPending ? `${totalPending} pending` : "All clear"}</span>
        </div>
        {totalPending === 0 ? (
          <div className="pop-empty">
            <span className="tile tile-lg green"><CheckCircle size={20} weight="duotone" /></span>
            <b>Nothing needs approval</b>
            <span>OWL asks here before it writes files or runs commands.</span>
          </div>
        ) : (
          <div className="pop-list">
            {pendingApprovals.map((approval) => (
              <div key={approval.id} className="pop-appr">
                <div className="pop-appr-head">
                  <span className="tile orange"><ShieldCheck size={15} weight="duotone" /></span>
                  <span className="pop-main"><b>{approval.title}</b><small>{approval.reason}</small></span>
                </div>
                {approval.command && <code className="pop-cmd">$ {approval.command}</code>}
                {approval.files && approval.files.length > 0 && <small className="pop-files mono">{approval.files.length} files · {approval.files[0]}{approval.files.length > 1 ? " …" : ""}</small>}
                <div className="pop-appr-acts">
                  <button className="btn btn-sm btn-ghost" onClick={() => { popover.close(false); goToScreen("workspace"); setCenterTab("changes"); }}>Review</button>
                  <span className="grow" />
                  <button className="btn btn-sm btn-secondary" onClick={() => decideApproval(approval.id, "rejected")}><X size={12} weight="bold" /> Reject</button>
                  <button className="btn btn-sm btn-primary" onClick={() => decideApproval(approval.id, "approved")}><Check size={12} weight="bold" /> Approve</button>
                </div>
              </div>
            ))}
            {backendPending > 0 && (
              <button className="pop-more" onClick={() => { popover.close(false); goToScreen("inbox"); }}>
                <span className="tile orange"><Tray size={15} weight="duotone" /></span>
                <span className="pop-main"><b>{backendPending} from saved tasks</b><small>Review them in the inbox</small></span>
                <CaretRight size={13} />
              </button>
            )}
          </div>
        )}
        <button className="pop-footlink" onClick={() => { popover.close(false); goToScreen("inbox"); }}>
          Open inbox <ArrowSquareOut size={13} />
        </button>
      </Popover>
    </>
  );
}
