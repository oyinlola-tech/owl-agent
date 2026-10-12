import { useState } from "react";
import { X } from "@phosphor-icons/react";

export function ChipInput({ label, hint, placeholder, values, onChange, suggestions = [] }: {
  label: string;
  hint?: string;
  placeholder?: string;
  values: string[];
  onChange: (values: string[]) => void;
  suggestions?: string[];
}) {
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const value = raw.trim();
    if (!value || values.some((existing) => existing.toLowerCase() === value.toLowerCase())) return;
    onChange([...values, value]);
    setDraft("");
  };
  const remove = (value: string) => onChange(values.filter((existing) => existing !== value));
  const openSuggestions = suggestions.filter((item) => !values.some((v) => v.toLowerCase() === item.toLowerCase()));

  return (
    <div className="pf-field">
      <span className="label">{label}</span>
      <div className="pf-chipbox">
        {values.map((value) => (
          <span className="pf-chip" key={value}>
            {value}
            <button type="button" aria-label={`Remove ${value}`} onClick={() => remove(value)}><X size={12} /></button>
          </span>
        ))}
        <input
          className="pf-chip-input" value={draft} placeholder={values.length ? "" : placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") { event.preventDefault(); add(draft); }
            else if (event.key === "Backspace" && !draft && values.length) remove(values[values.length - 1]);
          }}
          onBlur={() => add(draft)}
          aria-label={label}
        />
      </div>
      {openSuggestions.length > 0 && (
        <div className="pf-suggest">
          {openSuggestions.slice(0, 8).map((item) => (
            <button type="button" key={item} className="pf-suggest-item" onClick={() => add(item)}>+ {item}</button>
          ))}
        </div>
      )}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}
