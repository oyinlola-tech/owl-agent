import { CheckCircle, PencilSimple, Plus } from "@phosphor-icons/react";
import type { ProviderCard } from "../../../../../services/agentApi.types";
import { Tag } from "../../../../../../shared/components/tag.component";
import { describeProviderStatus, resolveActiveModelLabel } from "../providerStatus.helper";

function providerInitials(label: string): string {
  const letters = label.replace(/[^a-z0-9]/gi, "");
  return (letters.slice(0, 2) || "AI").toUpperCase();
}

export function ProviderCardTile({ card, onEdit, onUse }: {
  card: ProviderCard;
  onEdit: (card: ProviderCard) => void;
  onUse: (card: ProviderCard) => void;
}) {
  const status = describeProviderStatus(card);
  const configured = card.has_key || !card.requires_key;
  const canUse = configured && !card.active && card.status === "connected";
  return (
    <div className={`pv-card${card.active ? " pv-card-active" : ""}`}>
      <div className="pv-card-head">
        <span className={`pv-mark pv-mark-${card.group}`} aria-hidden="true">{providerInitials(card.label)}</span>
        <div className="pv-card-id">
          <b>{card.label}</b>
          <div className="pv-card-chips">
            {card.active && <Tag hue="blue" dot>Active</Tag>}
            <Tag hue={status.hue} dot>{status.label}</Tag>
          </div>
        </div>
      </div>
      <p className="pv-card-desc">{card.description}</p>
      <div className="pv-card-meta">
        {card.has_key
          ? <span>Key saved {card.key_hint ? <code>{card.key_hint}</code> : null}{card.key_source === "env" ? " · from environment" : ""}</span>
          : card.requires_key
            ? <span>No key yet</span>
            : <span className="pv-mono">{card.base_url || "No address set"}</span>}
        {card.active && <span className="pv-card-model">{resolveActiveModelLabel(card)}</span>}
      </div>
      <div className="pv-card-actions">
        <button className="btn btn-secondary btn-sm" onClick={() => onEdit(card)}>
          {configured ? <PencilSimple size={14} /> : <Plus size={14} />}
          {configured ? "Edit" : "Set up"}
        </button>
        {canUse && (
          <button className="btn btn-dark btn-sm" onClick={() => onUse(card)}>
            <CheckCircle size={14} /> Use this provider
          </button>
        )}
      </div>
    </div>
  );
}
