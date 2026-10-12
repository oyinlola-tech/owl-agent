export function OwlMark({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <svg className={`owl-mark ${className}`} width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--ink)" />
      <path d="M7 10.5 L11.5 13 M25 10.5 L20.5 13" stroke="var(--ink-inverse)" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="11.5" cy="17" r="4.6" fill="var(--ink-inverse)" />
      <circle cx="20.5" cy="17" r="4.6" fill="var(--ink-inverse)" />
      <circle className="owl-pupil" cx="12" cy="17.2" r="2" fill="var(--ink)" />
      <circle className="owl-pupil" cx="21" cy="17.2" r="2" fill="var(--ink)" />
      <path d="M14.6 22.6 L16 24.4 L17.4 22.6 Z" fill="var(--orange)" />
    </svg>
  );
}
