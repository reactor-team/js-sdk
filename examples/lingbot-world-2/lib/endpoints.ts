export interface Endpoint {
  label: string;
  description: string;
  url: string;
  local: boolean;
}

export const PROD_URL = "https://api.reactor.inc";

// Matches the local port the serve-lingbot-http run.sh bridges to
// (ssh -L localhost:<port> -> remote serve, default 8089). Editable in the
// Settings bar when the "Local (Direct)" endpoint is selected.
export const DEFAULT_LOCAL_URL = "http://localhost:8089";

export const ENDPOINTS: Endpoint[] = [
  {
    label: "Production",
    description: "Reactor production environment (api.reactor.inc)",
    url: PROD_URL,
    local: false,
  },
  {
    label: "Local (Direct)",
    description: "Connect directly to a model's runtime, no coordinator needed",
    url: DEFAULT_LOCAL_URL,
    local: true,
  },
];

export function getDefaultEndpoint(): Endpoint {
  const envUrl = process.env.NEXT_PUBLIC_COORDINATOR_URL;
  if (envUrl) {
    const match = ENDPOINTS.find((ep) => ep.url === envUrl);
    if (match) return match;
  }
  // Default to Production — the passcode-gated public demo should connect
  // there out of the box. Switch to Local (Direct) manually when testing
  // against a locally-served backend.
  return ENDPOINTS.find((ep) => !ep.local) ?? ENDPOINTS[0];
}
