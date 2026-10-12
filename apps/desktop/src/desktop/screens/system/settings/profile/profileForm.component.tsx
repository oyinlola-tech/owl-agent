import type { UserProfile } from "../../../../services/agentApi.types";
import { ChipInput } from "./chipInput.component";
import "./profile.style.css";

const EXPERIENCE_LEVELS = ["New to this", "Some experience", "Comfortable", "Senior / expert"];
const LANGUAGE_SUGGESTIONS = ["TypeScript", "React", "Python", "Go", "Rust", "Next.js", "Node", "Swift", "Kotlin", "Java"];
const PACKAGE_MANAGER_SUGGESTIONS = ["npm", "pnpm", "yarn", "bun", "pip", "uv", "poetry", "cargo", "go mod"];

export function ProfileForm({ value, onChange, variant = "full" }: {
  value: UserProfile;
  onChange: (next: UserProfile) => void;
  variant?: "full" | "onboarding";
}) {
  const set = <Key extends keyof UserProfile>(key: Key, next: UserProfile[Key]) => onChange({ ...value, [key]: next });
  return (
    <div className="pf-form">
      <div className="pf-field">
        <span className="label">What should OWL call you?</span>
        <input className="input" value={value.display_name} placeholder="Your name"
          onChange={(event) => set("display_name", event.target.value)} aria-label="Display name" maxLength={80} />
        <span className="hint">Used in greetings. OWL never invents a name when this is blank.</span>
      </div>

      <div className="pf-row">
        <div className="pf-field">
          <span className="label">Your role <span className="pf-opt">optional</span></span>
          <input className="input" value={value.role} placeholder="e.g. Full-stack engineer"
            onChange={(event) => set("role", event.target.value)} aria-label="Role" maxLength={120} />
        </div>
        <div className="pf-field">
          <span className="label">Experience <span className="pf-opt">optional</span></span>
          <select className="input" value={value.experience} onChange={(event) => set("experience", event.target.value)} aria-label="Experience">
            <option value="">Prefer not to say</option>
            {EXPERIENCE_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
          </select>
        </div>
      </div>

      <ChipInput label="Languages and frameworks" placeholder="Type and press Enter" values={value.languages}
        onChange={(languages) => set("languages", languages)} suggestions={LANGUAGE_SUGGESTIONS}
        hint="OWL leans on these when it plans and writes code." />

      <div className="pf-row">
        <div className="pf-field">
          <span className="label">Code style <span className="pf-opt">optional</span></span>
          <input className="input" value={value.code_style} placeholder="e.g. Functional, small modules"
            onChange={(event) => set("code_style", event.target.value)} aria-label="Code style" maxLength={300} />
        </div>
        <div className="pf-field">
          <span className="label">Test framework <span className="pf-opt">optional</span></span>
          <input className="input" value={value.test_framework} placeholder="e.g. Vitest, pytest"
            onChange={(event) => set("test_framework", event.target.value)} aria-label="Test framework" maxLength={120} />
        </div>
      </div>

      {variant === "full" && (
        <>
          <ChipInput label="Package managers" placeholder="e.g. pnpm, uv" values={value.package_managers}
            onChange={(managers) => set("package_managers", managers)} suggestions={PACKAGE_MANAGER_SUGGESTIONS} />
          <div className="pf-row">
            <div className="pf-field">
              <span className="label">Commit style <span className="pf-opt">optional</span></span>
              <input className="input" value={value.commit_style} placeholder="e.g. Conventional Commits"
                onChange={(event) => set("commit_style", event.target.value)} aria-label="Commit style" maxLength={200} />
            </div>
            <div className="pf-field">
              <span className="label">Tone <span className="pf-opt">optional</span></span>
              <input className="input" value={value.tone} placeholder="e.g. Concise and direct"
                onChange={(event) => set("tone", event.target.value)} aria-label="Tone" maxLength={120} />
            </div>
          </div>
          <div className="pf-field">
            <span className="label">Projects folder <span className="pf-opt">optional</span></span>
            <input className="input pv-mono" value={value.projects_folder} placeholder="~/Projects"
              onChange={(event) => set("projects_folder", event.target.value)} aria-label="Projects folder" maxLength={1024} spellCheck={false} />
            <span className="hint">Where new projects are created by default.</span>
          </div>
        </>
      )}
    </div>
  );
}
