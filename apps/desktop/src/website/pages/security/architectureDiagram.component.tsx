export function ArchitectureDiagram() {
  return (
    <figure className="arch">
      <svg viewBox="0 0 880 300" role="img" aria-labelledby="arch-t arch-d">
        <title id="arch-t">How data moves in OWL</title>
        <desc id="arch-d">The desktop app talks to the local service on 127.0.0.1:8000. The service reads and writes files only inside authorized workspaces, and sends prompt context to the model provider over HTTPS.</desc>
        <defs>
          <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" className="arch-arrow" />
          </marker>
        </defs>
        <rect x="16" y="24" width="590" height="252" rx="16" className="arch-machine" />
        <text x="36" y="52" className="arch-cap">Your machine</text>

        <rect x="40" y="88" width="190" height="120" rx="12" className="arch-box" />
        <text x="135" y="132" className="arch-h">Desktop app</text>
        <text x="135" y="156" className="arch-s">Workspace, diffs,</text>
        <text x="135" y="174" className="arch-s">approvals</text>

        <rect x="330" y="88" width="250" height="120" rx="12" className="arch-box hot" />
        <text x="455" y="128" className="arch-h">Agent service</text>
        <text x="455" y="152" className="arch-s mono">127.0.0.1:8000</text>
        <text x="455" y="174" className="arch-s">approvals · journal · memory</text>

        <rect x="330" y="226" width="250" height="36" rx="8" className="arch-box soft" />
        <text x="455" y="249" className="arch-s">Files in OWL_WORKSPACES only</text>

        <rect x="680" y="88" width="180" height="120" rx="12" className="arch-box" />
        <text x="770" y="132" className="arch-h">Model provider</text>
        <text x="770" y="156" className="arch-s">NVIDIA by default</text>
        <text x="770" y="174" className="arch-s">your key</text>

        <line x1="232" y1="140" x2="326" y2="140" className="arch-line" markerEnd="url(#arr)" markerStart="url(#arr)" />
        <text x="279" y="128" className="arch-l">HTTP + SSE</text>
        <line x1="455" y1="210" x2="455" y2="224" className="arch-line" />
        <line x1="582" y1="140" x2="676" y2="140" className="arch-line out" markerEnd="url(#arr)" />
        <text x="642" y="116" className="arch-l">prompt context</text>
        <text x="642" y="166" className="arch-l">HTTPS</text>
      </svg>
      <figcaption>Only the context a step needs crosses the dashed boundary. Files are read and written by the local service, never by the provider.</figcaption>
    </figure>
  );
}
