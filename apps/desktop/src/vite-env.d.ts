/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OWL_SERVICE_URL?: string;
  readonly VITE_OWL_DEV_TOKEN?: string;
  readonly VITE_OWL_WEBSITE_ONLY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
