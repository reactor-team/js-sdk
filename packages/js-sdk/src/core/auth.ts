/**
 * Auth primitives shared by the session-lifecycle clients
 * (CoordinatorClient, WebRTCTransportClient).
 *
 * The SDK historically captured the JWT as a single string at
 * `connect()` time and reused it on every subsequent HTTP call. That
 * breaks anyone passing a short-lived token (e.g. a Clerk session
 * JWT, default lifetime ~60s): once it expires, *all* Coordinator
 * HTTP hops (`POST /sessions/:id/uploads`, `GET /clips`,
 * `GET /sessions/:id`, ICE refresh, SDP renegotiation, …) start
 * 401-ing with `Invalid or expired token`. See REA-2512.
 *
 * The fix is to widen every `jwtToken: string` field to accept a
 * lazy {@link JwtResolver} as well: the SDK calls the resolver
 * immediately before each fetch, so the token in flight is always
 * fresh. Consumers that already hold a long-lived SDK JWT can keep
 * passing a string — it's wrapped into a constant resolver and the
 * runtime cost is one extra function call per request.
 */

/**
 * Lazy resolver for the Coordinator bearer token.
 *
 * Called on every Coordinator HTTP request, so token refreshes (e.g.
 * Clerk's `getToken({ template: "reactor" })`, which the client SDK
 * caches and only round-trips to the network when the cache is near
 * expiry) are picked up automatically. Returning `""` produces a
 * request without an `Authorization` header — useful for local-dev
 * setups where the runtime serves auth-free endpoints.
 */
export type JwtResolver = () => string | Promise<string>;

/**
 * Accepted shape for any place that historically took a single
 * `jwtToken: string`. Either a static token, or a {@link JwtResolver}
 * the SDK invokes per request.
 */
export type JwtSource = string | JwtResolver;

/**
 * Normalize a {@link JwtSource} into a {@link JwtResolver}.
 *
 * A bare string is wrapped into a constant function — preserving the
 * pre-resolver behaviour for callers that pass long-lived SDK JWTs.
 * A function is returned as-is.
 */
export function normalizeJwtSource(source: JwtSource): JwtResolver {
  if (typeof source === "function") {
    return source;
  }
  return () => source;
}
