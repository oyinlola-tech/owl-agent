import type { ReactNode } from "react";
import type { Icon } from "@phosphor-icons/react";
import { Tile, type Hue } from "./tag.component";
import "../styles/primitives.style.css";

export function PageHeader({ icon, hue = "gray", title, lede, actions, eyebrow }: {
  icon?: Icon; hue?: Hue | "ink"; title: ReactNode; lede?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode;
}) {
  return (
    <header className="ph">
      {icon && <Tile icon={icon} hue={hue} size="xl" />}
      <div className="ph-row">
        <div className="ph-text">
          {eyebrow && <div className="ph-eyebrow">{eyebrow}</div>}
          <h1>{title}</h1>
          {lede && <p>{lede}</p>}
        </div>
        {actions && <div className="ph-actions">{actions}</div>}
      </div>
    </header>
  );
}

export function PropertyList({ rows }: { rows: { icon: Icon; label: string; value: ReactNode }[] }) {
  return (
    <dl className="props">
      {rows.map((r) => (
        <div key={r.label} className="prop">
          <dt><r.icon size={15} />{r.label}</dt>
          <dd>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function EmptyState({ icon: I, hue = "gray", title, body, children }: {
  icon: Icon; hue?: Hue; title: string; body?: ReactNode; children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <Tile icon={I} hue={hue} size="lg" />
      <h4>{title}</h4>
      {body && <p>{body}</p>}
      {children && <div className="row">{children}</div>}
    </div>
  );
}

export function SectionTitle({ children, count, actions }: { children: ReactNode; count?: number; actions?: ReactNode }) {
  return (
    <div className="sect">
      <h3>{children}{typeof count === "number" && <span className="sect-count">{count}</span>}</h3>
      {actions && <div className="sect-actions">{actions}</div>}
    </div>
  );
}

export function SampleDataBanner({ onRetry, what = "this list" }: { onRetry?: () => void; what?: string }) {
  return (
    <div className="demo-banner" role="status">
      <span className="demo-dot" />
      <span><b>Sample data.</b> The OWL service is offline, so {what} shows example work. Start the service to see your own.</span>
      {onRetry && <button className="btn btn-sm btn-secondary" onClick={onRetry}>Retry</button>}
    </div>
  );
}
