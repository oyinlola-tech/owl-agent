import { ArrowClockwise, LockKey } from "@phosphor-icons/react";
import { CommandBlock } from "../components/commandBlock.component";
import { SERVICE_BASE_URL } from "../services/connection/serviceRequest.service";
import { forgetServiceToken } from "../services/connection/serviceToken.service";
import { markServiceAuthWorking } from "../services/connection/serviceConnection.store";
import { isRunningInsideDesktopShell } from "../../shared/platform/runtimeMode.helper";
import { PageHeader } from "../../shared/components/pageLayout.component";

const DEV_TOKEN_SETUP = [
  "# apps/desktop/.env.local (any random value, at least 16 characters)",
  "VITE_OWL_DEV_TOKEN=pick-a-long-random-dev-token",
  "# start the service with the same value",
  "cd services/agent",
  "OWL_DEV_TOKEN=pick-a-long-random-dev-token .venv/bin/python -m uvicorn --factory app:create_app --port 8000",
].join("\n");

function retryWithFreshToken() {
  forgetServiceToken();
  markServiceAuthWorking();
}

export function ServiceAuthErrorPanel() {
  const insideDesktopApp = isRunningInsideDesktopShell();
  return (
    <div className="page" role="alert" aria-labelledby="service-auth-title">
      <PageHeader icon={LockKey} hue="red" title={<span id="service-auth-title">Can't authenticate with the local OWL service</span>}
        lede={<>The service at <span className="pg-mono">{SERVICE_BASE_URL}</span> is running but refused this app's access token. OWL won't show sample data or send changes until this is fixed.</>}
        actions={<button className="btn btn-secondary" onClick={retryWithFreshToken}><ArrowClockwise size={14} /> Try again</button>} />
      <div className="surface pg-setgroup">
        <h4>What to do</h4>
        {insideDesktopApp ? (
          <p className="pg-p">Another OWL service is already using port 8000 and its token couldn't be read. Quit OWL, stop any OWL service you started by hand, then open OWL again. The app starts its own service with a fresh token.</p>
        ) : (
          <>
            <p className="pg-p">In development the browser build sends <code>VITE_OWL_DEV_TOKEN</code>. Set it, start the service with the same <code>OWL_DEV_TOKEN</code>, then restart the dev server.</p>
            <CommandBlock code={DEV_TOKEN_SETUP} />
          </>
        )}
      </div>
    </div>
  );
}
