// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

import type { OpenApiSchema } from "./openapi/index.js";

// ---------------------------------------------------------------------------
// Coordinator fetcher — pulls an OpenAPI schema straight from the control
// plane instead of reading it off disk. Keeps the same return type as
// `loadSchema` so downstream stages (`parseSchema`, the emitter, the CLI)
// don't need to know where the document came from.
// ---------------------------------------------------------------------------

export interface FetchSchemaOptions {
  /**
   * Coordinator base URL — scheme + host, no trailing slash required.
   * E.g. `https://api.reactor.inc` or `http://localhost:8080`.
   */
  coordinatorUrl: string;
  /**
   * Model UUID — the `{id}` path parameter on
   * `/admin/models/{id}/schemas`. Model names are not accepted by the
   * coordinator, so the CLI only surfaces UUIDs.
   */
  modelId: string;
  /**
   * Optional semver-prefix release selector. When supplied we hit
   * `?release=<release>` and the coordinator returns the single matching
   * record. When omitted we list and pick the most recently created one
   * (the default CI workflow: "give me the latest schema").
   */
  release?: string;
  /**
   * Reactor API key (e.g. `rk_a1b2c3...`). Per the REST API contract an
   * API key is only valid on `POST /tokens`; everything else expects a
   * short-lived JWT in `Authorization: Bearer`. If this is set (and
   * `bearerToken` is not) the function exchanges the key for a JWT via
   * `/tokens` before issuing any `/admin/*` request.
   *
   * Public models are readable without auth; private models return
   * `404` to unauthenticated callers (the coordinator never leaks
   * existence via `403`). When both `apiKey` and `bearerToken` are
   * unset, the request is anonymous.
   */
  apiKey?: string;
  /**
   * Pre-exchanged JWT. When set, skips the `POST /tokens` round-trip
   * and uses this verbatim as `Authorization: Bearer <bearerToken>`.
   * Intended for callers that already hold a JWT (e.g. the CLI, which
   * exchanges once and reuses across `resolveModelIdByName` +
   * `fetchSchema`) or for tests that want to bypass the token dance.
   *
   * When both `bearerToken` and `apiKey` are set, `bearerToken` wins.
   */
  bearerToken?: string;
  /**
   * Injection seam for tests. Defaults to the global `fetch` (Node 18+).
   * Keeps the production code dependency-free while letting us exercise
   * every status-code branch against a local function.
   */
  fetchImpl?: typeof fetch;
}

// ---------------------------------------------------------------------------
// Coordinator response shapes — mirror what the REST API doc promises.
// Kept `unknown` at the schema payload level so the parser still owns the
// OpenAPI validation contract.
// ---------------------------------------------------------------------------

interface CoordinatorSchemaRecord {
  id: string;
  model_id: string;
  release: string;
  schema: unknown;
  created_at: number;
  updated_at: number;
}

interface CoordinatorSchemaSummary {
  id: string;
  release: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function trimTrailingSlashes(url: string): string {
  return url.replace(/\/+$/, "");
}

// Pin the API version we speak at the protocol level. The coordinator's
// docs say "`Reactor-API-Version`" is validated on `/tokens` and
// `/sessions`; adding it everywhere is safe and keeps us compatible if
// that gate ever widens to `/admin/*`.
const REACTOR_API_VERSION = "1";

/**
 * Build request headers for a coordinator call. When `bearerToken` is
 * set it becomes `Authorization: Bearer <token>`; otherwise the
 * request goes out anonymous (which only succeeds on public-model
 * reads — see the 404-on-private note on {@link FetchSchemaOptions}).
 */
function buildHeaders(bearerToken: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Reactor-API-Version": REACTOR_API_VERSION,
  };
  if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;
  return headers;
}

function requireUuidLike(modelId: string): void {
  // The coordinator returns `400` for malformed UUIDs, but surfacing the
  // check client-side gives a clearer error than "400 Bad Request" with
  // no body. We don't do strict UUID validation — any obviously-broken
  // value (empty, whitespace, slash, embedded scheme) fails fast.
  const invalid =
    modelId.length === 0 ||
    /\s/.test(modelId) ||
    modelId.includes("/") ||
    modelId.includes(":");
  if (invalid) {
    throw new Error(
      `Invalid --model-id: expected a UUID, got ${JSON.stringify(modelId)}`,
    );
  }
}

async function readBody(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return "";
  }
}

/**
 * Translate a non-2xx response into a user-facing error. The coordinator
 * uses `404` for both "model not found" and "private model, caller not
 * authorised" (see REST-API.md § Access Control), so the message nudges
 * the user to double-check both.
 */
async function responseToError(
  response: Response,
  context: string,
): Promise<Error> {
  const body = await readBody(response);
  const suffix = body ? `: ${body}` : "";

  switch (response.status) {
    case 401:
      return new Error(
        `Coordinator rejected credentials (401) while ${context}. ` +
          `Check --api-key (or REACTOR_API_KEY)${suffix}`,
      );
    case 403:
      return new Error(
        `Coordinator forbade the request (403) while ${context}. ` +
          `The provided token lacks the required role${suffix}`,
      );
    case 404:
      return new Error(
        `Coordinator returned 404 while ${context}. ` +
          `Either the model ID is wrong, no schema is registered for the ` +
          `requested release, or the model is private and --api-key was ` +
          `not supplied${suffix}`,
      );
    default:
      return new Error(
        `Coordinator responded with ${response.status} ${response.statusText} while ${context}${suffix}`,
      );
  }
}

async function getJson<T>(
  fetchImpl: typeof fetch,
  url: string,
  headers: Record<string, string>,
  context: string,
): Promise<T> {
  let response: Response;
  try {
    response = await fetchImpl(url, { method: "GET", headers });
  } catch (err) {
    // Wrap the underlying network error so the CLI can fail without a
    // raw `TypeError: fetch failed` / cause chain leaking to the user.
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to reach coordinator at ${url} while ${context}: ${msg}`,
    );
  }

  if (!response.ok) {
    throw await responseToError(response, context);
  }

  try {
    return (await response.json()) as T;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Coordinator returned non-JSON body while ${context}: ${msg}`,
    );
  }
}

// ---------------------------------------------------------------------------
// API key → JWT exchange.
//
// Per `docs/REST-API.md`, a Reactor API key is only valid on
// `POST /tokens` (via `Reactor-API-Key: <key>`); every other endpoint
// wants `Authorization: Bearer <jwt>`. This helper owns that one-shot
// exchange so the rest of the fetcher can work in JWTs from here on.
// ---------------------------------------------------------------------------

export interface ExchangeApiKeyOptions {
  coordinatorUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}

function assertTokenResponse(
  payload: unknown,
): asserts payload is { jwt: string } {
  if (
    !payload ||
    typeof payload !== "object" ||
    typeof (payload as { jwt?: unknown }).jwt !== "string" ||
    (payload as { jwt: string }).jwt.length === 0
  ) {
    throw new Error(
      `Coordinator returned an unexpected /tokens payload shape ` +
        `(expected { "jwt": string })`,
    );
  }
}

/**
 * Exchange a Reactor API key for a short-lived JWT via `POST /tokens`.
 * Returns the raw JWT string; the caller is responsible for passing it
 * as `bearerToken` to {@link fetchSchema} / {@link resolveModelIdByName}
 * (or for dropping it straight into `Authorization: Bearer`).
 *
 * Failure modes match the rest of the coordinator fetcher: network
 * errors are wrapped with the target URL, non-2xx responses get a
 * `401`-specific actionable message, and malformed payloads throw.
 */
export async function exchangeApiKeyForJwt(
  options: ExchangeApiKeyOptions,
): Promise<string> {
  if (typeof options.apiKey !== "string" || options.apiKey.length === 0) {
    throw new Error("Invalid --api-key: expected a non-empty string");
  }

  const base = trimTrailingSlashes(options.coordinatorUrl);
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = `${base}/tokens`;
  const context = "exchanging API key for JWT";

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        // `Reactor-API-Key` is the current (non-deprecated) token-
        // generation header; see REST-API.md § Authentication. We
        // deliberately don't fall back to `X-API-Key` — the codegen
        // is new code and shipping the legacy header would just
        // delay that deprecation.
        "Reactor-API-Key": options.apiKey,
        "Reactor-API-Version": REACTOR_API_VERSION,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to reach coordinator at ${url} while ${context}: ${msg}`,
    );
  }

  if (!response.ok) {
    throw await responseToError(response, context);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Coordinator returned non-JSON body while ${context}: ${msg}`,
    );
  }
  assertTokenResponse(payload);
  return payload.jwt;
}

/**
 * Resolve the bearer token a coordinator request should use. When the
 * caller hands us a `bearerToken` we use it verbatim; when they hand us
 * an `apiKey` we exchange via {@link exchangeApiKeyForJwt}; when both
 * are absent the return is `undefined` (→ anonymous request).
 */
async function resolveBearerToken(
  coordinatorUrl: string,
  fetchImpl: typeof fetch,
  bearerToken: string | undefined,
  apiKey: string | undefined,
): Promise<string | undefined> {
  if (bearerToken) return bearerToken;
  if (!apiKey) return undefined;
  return exchangeApiKeyForJwt({ coordinatorUrl, apiKey, fetchImpl });
}

function assertRecord(
  payload: unknown,
  context: string,
): asserts payload is CoordinatorSchemaRecord {
  if (
    !payload ||
    typeof payload !== "object" ||
    !("schema" in payload) ||
    typeof (payload as { schema: unknown }).schema !== "object" ||
    (payload as { schema: unknown }).schema === null
  ) {
    throw new Error(
      `Coordinator returned an unexpected payload shape while ${context} ` +
        `(expected a schema record with a "schema" object)`,
    );
  }
}

function assertSummaryList(
  payload: unknown,
  context: string,
): asserts payload is CoordinatorSchemaSummary[] {
  if (!Array.isArray(payload)) {
    throw new Error(
      `Coordinator returned an unexpected payload shape while ${context} ` +
        `(expected an array of {id, release} summaries)`,
    );
  }
}

// ---------------------------------------------------------------------------
// Latest-release resolution.
//
// Today we get the "latest" release by listing /schemas and picking the
// highest semver client-side. This is isolated in `pickLatestRelease`
// (not inlined into `fetchSchema`) because the coordinator team plans to
// expose a dedicated `/releases?latest` endpoint — when that ships, this
// function becomes a trivial passthrough around that call and every
// caller gets the benefit without a public API change.
//
// Release tag shape in Reactor is `v<MAJOR>.<MINOR>.<PATCH>-g<sha>`.
// We compare on the numeric triple; tie-breaks fall back to the full
// release string lexicographically (which covers `-g<sha>` consistently
// for a given build but is NOT timestamp-ordered across builds — that's
// the case the server-side endpoint will eventually handle properly).
// ---------------------------------------------------------------------------

interface ParsedRelease {
  major: number;
  minor: number;
  patch: number;
  suffix: string;
}

function parseReleaseTag(tag: string): ParsedRelease | null {
  // Accept both `v1.2.3` and `1.2.3` so we don't reject a stray tag
  // style — the comparator just needs the numeric prefix.
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+](.*))?$/.exec(tag);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    suffix: match[4] ?? "",
  };
}

/**
 * Compare two release tags in semver-ish ascending order. Returns
 * negative if `a` sorts before `b`, positive if after, 0 if equal.
 * Unparseable tags sort *before* parseable ones so they can't beat a
 * valid release in a `max` operation.
 */
function compareReleaseTags(a: string, b: string): number {
  const pa = parseReleaseTag(a);
  const pb = parseReleaseTag(b);
  if (!pa && !pb) return a.localeCompare(b);
  if (!pa) return -1;
  if (!pb) return 1;
  if (pa.major !== pb.major) return pa.major - pb.major;
  if (pa.minor !== pb.minor) return pa.minor - pb.minor;
  if (pa.patch !== pb.patch) return pa.patch - pb.patch;
  // Same numeric triple → fall back to a lexicographic compare on the
  // parsed suffix so cosmetic differences in the *prefix* (`v1.2.3` vs
  // `1.2.3`) don't leak into ordering. When suffixes also match, the
  // tags are semantically equal and we return 0.
  //
  // Caveat: for Reactor's `-g<sha>` suffixes this is stable but not
  // timestamp order — if two builds share a triple, the one the
  // comparator picks isn't meaningfully "newer". Fine for current use
  // (the team bumps semver on every CI run); the server-side
  // `/releases?latest` endpoint will supersede this when it lands.
  return pa.suffix.localeCompare(pb.suffix);
}

/**
 * Return the entry in `summaries` with the highest release tag, or
 * `null` if the list is empty. Exposed as a standalone export so the
 * CI pipeline (and anyone writing their own client) can reuse the
 * exact same ordering the codegen uses, and so we can replace the
 * internals with a `/releases?latest` call without changing callers.
 */
export function pickLatestRelease(
  summaries: CoordinatorSchemaSummary[],
): CoordinatorSchemaSummary | null {
  if (summaries.length === 0) return null;
  let best = summaries[0];
  for (let i = 1; i < summaries.length; i++) {
    if (compareReleaseTags(summaries[i].release, best.release) > 0) {
      best = summaries[i];
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Model UUID resolution by name.
//
// The `/admin/models/{id}/schemas` endpoint takes a UUID path param, but
// CI pipelines (and humans) think in model *names* — "helios", not
// `7b3f1bc2-…`. Resolving names here keeps the bash around the CLI tiny
// and centralises the "which ID does this name map to?" logic in one
// tested place.
//
// Caveat: `GET /admin/models` is admin-only, so this path requires a
// bearer token that can list models. Public schema reads via `--model-id`
// still work without auth.
// ---------------------------------------------------------------------------

interface CoordinatorModelSummary {
  id: string;
  name: string;
}

export interface ResolveModelIdOptions {
  coordinatorUrl: string;
  modelName: string;
  /** See {@link FetchSchemaOptions.apiKey}. */
  apiKey?: string;
  /** See {@link FetchSchemaOptions.bearerToken}. */
  bearerToken?: string;
  fetchImpl?: typeof fetch;
}

function assertModelSummaryList(
  payload: unknown,
  context: string,
): asserts payload is CoordinatorModelSummary[] {
  if (!Array.isArray(payload)) {
    throw new Error(
      `Coordinator returned an unexpected payload shape while ${context} ` +
        `(expected an array of model summaries)`,
    );
  }
}

/**
 * Look up a model's UUID by name. Calls `GET /admin/models`, finds the
 * exact-match entry, and returns its `id`. Throws when no match exists
 * so the CLI can surface a clear "no such model" error instead of
 * degrading into a misleading 404 later in the fetch flow.
 */
export async function resolveModelIdByName(
  options: ResolveModelIdOptions,
): Promise<string> {
  if (typeof options.modelName !== "string" || options.modelName.length === 0) {
    throw new Error(
      `Invalid --model: expected a non-empty name, got ${JSON.stringify(options.modelName)}`,
    );
  }

  const base = trimTrailingSlashes(options.coordinatorUrl);
  const fetchImpl = options.fetchImpl ?? fetch;
  // Exchange the API key for a JWT once per call; every subsequent
  // coordinator request on this call uses the same JWT.
  const bearerToken = await resolveBearerToken(
    base,
    fetchImpl,
    options.bearerToken,
    options.apiKey,
  );
  const headers = buildHeaders(bearerToken);
  const url = `${base}/admin/models`;
  const context = `resolving model "${options.modelName}" to a UUID`;

  const summaries = await getJson<unknown>(fetchImpl, url, headers, context);
  assertModelSummaryList(summaries, context);

  const match = summaries.find((m) => m && m.name === options.modelName);
  if (!match) {
    throw new Error(
      `No model named ${JSON.stringify(options.modelName)} registered on the coordinator. ` +
        `Check the name (it's case-sensitive) or that the --api-key is authorised to list models.`,
    );
  }
  if (typeof match.id !== "string" || match.id.length === 0) {
    throw new Error(
      `Coordinator returned a summary for "${options.modelName}" without a usable "id" field.`,
    );
  }
  return match.id;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch an OpenAPI schema registered against a model on the Reactor
 * coordinator. Returns the raw `OpenApiSchema` document — callers feed it
 * straight into {@link parseSchema} to produce the codegen IR.
 *
 * Release selection:
 *   - With `release`: hits `GET /admin/models/{id}/schemas?release=<release>`.
 *     The coordinator does a semver-prefix match (`v1.0.5` matches
 *     `v1.0.5-ge6187a05` etc.) and returns the most recently created
 *     record when multiple rows match.
 *   - Without `release`: lists `(id, release)` pairs, delegates to
 *     {@link pickLatestRelease} (highest semver, ties broken lexicographically),
 *     then issues a follow-up `GET /admin/models/{id}/schemas/{schema_id}`
 *     to fetch the full payload. The "pick highest" step is deliberately
 *     isolated so it can be replaced with a `/releases?latest` call if
 *     and when the coordinator exposes one.
 *
 * Auth:
 *   - Public models are readable without `apiKey`.
 *   - Private models return `404` (not `403`) to unauthenticated callers
 *     so their existence is never leaked. The raised error wording
 *     reflects both interpretations.
 */
export async function fetchSchema(
  options: FetchSchemaOptions,
): Promise<OpenApiSchema> {
  requireUuidLike(options.modelId);

  const base = trimTrailingSlashes(options.coordinatorUrl);
  const fetchImpl = options.fetchImpl ?? fetch;
  // Exchange the API key for a JWT once per call; every subsequent
  // coordinator request (including the list+detail two-step) shares
  // that JWT.
  const bearerToken = await resolveBearerToken(
    base,
    fetchImpl,
    options.bearerToken,
    options.apiKey,
  );
  const headers = buildHeaders(bearerToken);
  const baseResource = `${base}/admin/models/${encodeURIComponent(options.modelId)}/schemas`;

  // Release-scoped lookup: one request, single full record back.
  if (options.release) {
    const url = `${baseResource}?release=${encodeURIComponent(options.release)}`;
    const context = `fetching schema for release "${options.release}"`;
    const record = await getJson<unknown>(fetchImpl, url, headers, context);
    assertRecord(record, context);
    return record.schema as OpenApiSchema;
  }

  // No release specified: list + pick-latest-by-semver. The list
  // endpoint omits the schema payload, so a follow-up by ID is required.
  // We deliberately don't try to optimise this into a single call (e.g.
  // `?release=v`) — the coordinator does not guarantee a prefix like `v`
  // matches everything, and the API contract for "newest wins" only
  // kicks in when there's more than one match for a given prefix.
  const listUrl = baseResource;
  const listContext = "listing registered schemas";
  const summaries = await getJson<unknown>(
    fetchImpl,
    listUrl,
    headers,
    listContext,
  );
  assertSummaryList(summaries, listContext);

  if (summaries.length === 0) {
    throw new Error(
      `No schemas registered for model ${options.modelId}. Pass --release ` +
        `with a semver prefix once a schema has been published.`,
    );
  }

  const latest = pickLatestRelease(summaries);
  if (!latest || typeof latest.id !== "string") {
    throw new Error(
      `Coordinator returned an unexpected summary entry while ${listContext} ` +
        `(missing "id" field).`,
    );
  }

  const detailContext = `fetching schema ${latest.id} (release "${latest.release}")`;
  const detailUrl = `${baseResource}/${encodeURIComponent(latest.id)}`;
  const record = await getJson<unknown>(
    fetchImpl,
    detailUrl,
    headers,
    detailContext,
  );
  assertRecord(record, detailContext);
  return record.schema as OpenApiSchema;
}

// Re-export internal helpers for targeted unit testing.
// Public API consumers should only use `fetchSchema`.
export const __testing__ = {
  trimTrailingSlashes,
  buildHeaders,
  requireUuidLike,
  compareReleaseTags,
  parseReleaseTag,
};
