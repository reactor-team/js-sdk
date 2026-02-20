export interface Endpoint {
  label: string;
  url: string;
}

export const ENDPOINTS: Endpoint[] = [
  { label: "Production", url: "https://api.reactor.inc" },
  { label: "Dev", url: "https://api.rea.live"},
  { label: "Local", url: "http://localhost:30080" },
];
