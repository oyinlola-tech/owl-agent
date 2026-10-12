import type { ReactNode } from "react";
import type { Icon } from "@phosphor-icons/react";
import { Cloud, HardDrives } from "@phosphor-icons/react";
import type { ProviderCard, ProviderGroup } from "../../../../../services/agentApi.types";
import { ProviderCardTile } from "./providerCard.component";

const GROUP_META: Record<ProviderGroup, { title: string; blurb: string; icon: Icon }> = {
  cloud: { title: "Cloud models", blurb: "Paste a key from the provider. The key is sent once and stored by the service, never shown again.", icon: Cloud },
  local: { title: "Local models", blurb: "Run on this computer. No key, no data leaves your machine. OWL connects to the local server.", icon: HardDrives },
};

export function ProviderGroupSection({ group, cards, onEdit, onUse, aside }: {
  group: ProviderGroup;
  cards: ProviderCard[];
  onEdit: (card: ProviderCard) => void;
  onUse: (card: ProviderCard) => void;
  aside?: ReactNode;
}) {
  const meta = GROUP_META[group];
  if (cards.length === 0) return null;
  return (
    <section className="pv-group" aria-label={meta.title}>
      <div className="pv-group-head">
        <meta.icon size={17} weight="duotone" />
        <div>
          <h4>{meta.title}</h4>
          <p>{meta.blurb}</p>
        </div>
        {aside}
      </div>
      <div className="pv-grid">
        {cards.map((card) => (
          <ProviderCardTile key={card.id} card={card} onEdit={onEdit} onUse={onUse} />
        ))}
      </div>
    </section>
  );
}
