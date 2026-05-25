/**
 * Lazy resolver for the Coordinator bearer token. The SDK calls this
 * immediately before each authenticated HTTP request, so short-lived
 * tokens (Clerk session JWTs, etc.) are refreshed transparently.
 * Returning `""` suppresses the `Authorization` header entirely.
 */
export type JwtResolver = () => string | Promise<string>;

/** Static token, or a {@link JwtResolver} invoked per request. */
export type JwtSource = string | JwtResolver;

/** Wrap a {@link JwtSource} into a {@link JwtResolver}. */
export function normalizeJwtSource(source: JwtSource): JwtResolver {
  if (typeof source === "function") {
    return source;
  }
  return () => source;
}
