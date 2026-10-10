const WALL = [
  { name: "GitHub", slug: "github" },
  { name: "GitLab", slug: "gitlab" },
  { name: "Docker", slug: "docker" },
  { name: "VS Code", slug: "visualstudiocode" },
  { name: "Node.js", slug: "nodedotjs" },
];

export default function Hero() {
  return (
    <>
      <section className="hero-band" id="top">
        <div className="hero-inner">
          <div className="dot-row" aria-hidden="true">
            <i style={{ background: "#ff64c8" }} />
            <i style={{ background: "#f5d75e" }} />
            <i style={{ background: "#2a9d99" }} />
            <i style={{ background: "#7b3ff2" }} />
            <i style={{ background: "#dd5b00" }} />
          </div>
          <h1>Meet the agent that shows its work</h1>
          <p className="hero-sub">
            One workspace for files, code, terminal, and browser. The agent shows its work, you approve each step.
          </p>
          <div className="hero-cta">
            <a className="btn btn-primary" href="/app">Open the app</a>
            <a className="btn btn-outline-dark" href="#workspace">See the workspace</a>
          </div>
          <div className="mockup" role="img" aria-label="Preview of the OWL Agent workspace with files, chat, activity, and terminal panels">
            <div className="mockup-bar">
              <span className="lights"><i /><i /><i /></span>
              <span>OWL AGENT</span>
              <span style={{ marginLeft: "auto", fontWeight: 500, color: "var(--steel)" }}>Project: ZudoMart</span>
            </div>
            <div className="mockup-grid">
              <div className="mockup-col">
                <h6>FILES</h6>
                <div className="frow">src/api</div>
                <div className="frow">src/auth</div>
                <div className="frow on">service.go</div>
                <div className="frow">middleware.go</div>
                <div className="frow">tests</div>
                <div className="frow">README.md</div>
              </div>
              <div className="mockup-col">
                <h6>CHAT</h6>
                <div className="msg"><b>You:</b> Build auth with JWT and Postgres.</div>
                <div className="msg"><b>OWL:</b> I read 8 files. Plan: service, hashing, tokens, middleware, tests.</div>
                <div className="approve-card">
                  OWL wants to modify 7 files.
                  <div className="row"><button className="mini-btn" tabIndex={-1}>Reject</button><button className="mini-btn go" tabIndex={-1}>Approve</button></div>
                </div>
              </div>
              <div className="mockup-col">
                <h6>ACTIVITY</h6>
                <div className="act">Done: analyzed repository</div>
                <div className="act">Done: read user.go</div>
                <div className="act">Working: creating service</div>
                <div className="act">Queued: running tests</div>
              </div>
            </div>
            <div className="term">$ go test ./... <span className="ok">PASS</span> (auth, users, payments)</div>
          </div>
        </div>
        <div className="hero-pad" />
      </section>
      <div className="logo-wall">
        <div className="wrap logo-wall-inner">
          <p>Works with the tools you already use</p>
          {WALL.map((w) => (
            <span key={w.slug}>
              <img className="only-light" src={`https://cdn.simpleicons.org/${w.slug}`} alt={w.name} loading="lazy" />
              <img className="only-dark" src={`https://cdn.simpleicons.org/${w.slug}/white`} alt={w.name} loading="lazy" />
            </span>
          ))}
        </div>
      </div>
    </>
  );
}
