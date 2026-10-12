import type { Icon } from "@phosphor-icons/react";

interface StatCardProps {
  icon: Icon;
  hue: string;
  label: string;
  value: string;
  sub?: string;
}

export function StatCard({ icon: StatIcon, hue, label, value, sub }: StatCardProps) {
  return (
    <div className="x-stat">
      <span className={`tile ${hue}`}><StatIcon size={16} weight="duotone" /></span>
      <div>
        <div className="x-stat-v">{value}</div>
        <div className="x-stat-l">{label}</div>
        {sub && <div className="x-stat-s">{sub}</div>}
      </div>
    </div>
  );
}
