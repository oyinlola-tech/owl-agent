import { ProviderSetupPanel } from "./providerSetup.component";

export function AiProvidersSettingsSection() {
  return (
    <div className="pv-settings">
      <div className="surface pg-setgroup">
        <h4>Connect a model</h4>
        <p className="pg-p pg-muted pv-settings-lede">
          OWL needs one active provider. Add a cloud key or point at a model running on this computer, test it, then choose it.
          Exactly one provider is active at a time; the router picks models within it.
        </p>
      </div>
      <ProviderSetupPanel />
    </div>
  );
}
