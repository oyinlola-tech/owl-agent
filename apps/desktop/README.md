# OWL Agent (desktop frontend, mock phase)

Professional desktop AI coding agent shell. Frontend only: every agent event is
simulated by `src/app/agent/service.ts`. No NVIDIA, filesystem, terminal, or
browser backends are connected yet.

## Run locally

```bash
cd apps/desktop
npm install
npm run dev      # web preview (Tauri fixed port: http://localhost:1420/)
npm run build    # typecheck + production build
```

Desktop shell (requires a Rust toolchain, not needed for UI work):

```bash
npm run tauri dev
npm run tauri build
```

## Where things live

- `src/landing/` — single marketing page (Notion token system, light and dark)
- `src/app/` — desktop app: `types.ts`, `seed.ts` (mock data), `store.ts`
  (zustand), `agent/service.ts` (AgentService interface + mock),
  `chrome.tsx`, `welcome.tsx`, `workspace.tsx`, `screens.tsx`
- `#/app`, `#/app/tasks`, `#/app/browser`, `#/app/projects`, `#/app/settings`

## Swapping in the real backend

Implement `AgentService` in `src/app/agent/service.ts` (e.g. over Tauri
events from the Python service) and construct it in `store.ts`. UI components
only consume the interface, so no rewrite is needed.
