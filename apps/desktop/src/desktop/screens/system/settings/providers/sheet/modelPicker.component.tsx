import { ArrowClockwise } from "@phosphor-icons/react";

export function ModelPicker({ models, value, onChange, onRefresh, refreshing, disabled }: {
  models: string[];
  value: string;
  onChange: (model: string) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="pv-model-picker">
      <select
        className="input" aria-label="Model" value={value || "auto"}
        onChange={(event) => onChange(event.target.value)} disabled={disabled}
      >
        <option value="auto">Auto (router picks per task)</option>
        {models.map((model) => <option key={model} value={model}>{model}</option>)}
      </select>
      {onRefresh && (
        <button
          type="button" className="btn btn-secondary btn-sm" onClick={onRefresh}
          disabled={refreshing || disabled}
        >
          <ArrowClockwise size={14} /> {refreshing ? "Loading…" : "Refresh models"}
        </button>
      )}
    </div>
  );
}
