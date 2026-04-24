// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

import { describe, expect, it, vi } from "vitest";

import {
  exchangeApiKeyForJwt,
  fetchSchema,
  pickLatestRelease,
  resolveModelIdByName,
  __testing__,
} from "../src/coordinator.js";
import type { OpenApiSchema } from "../src/openapi/index.js";

// ---------------------------------------------------------------------------
// Helpers — a minimal hand-rolled fetch stub so each test can assert on
// the exact URL + headers the coordinator fetcher sent.
// ---------------------------------------------------------------------------

const VALID_MODEL_ID = "7b3f1bc2-a4e5-4d78-b9c1-123456789abc";

interface Call {
  url: string;
  init?: RequestInit;
}

interface StubResponse {
  status: number;
  body: unknown;
  statusText?: string;
}

function jsonBody(body: unknown): string {
  return typeof body === "string" ? body : JSON.stringify(body);
}

function buildResponse(r: StubResponse): Response {
  return new Response(jsonBody(r.body), {
    status: r.status,
    statusText: r.statusText ?? (r.status === 200 ? "OK" : ""),
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Produces a fetch-compatible stub that returns a scripted sequence of
 * responses. If the test sends more requests than responses scripted it
 * fails with a clear message rather than returning `undefined`.
 */
function makeFetchStub(responses: StubResponse[]): {
  fetch: typeof fetch;
  calls: Call[];
} {
  const calls: Call[] = [];
  let idx = 0;
  const stub: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    calls.push({ url, init });
    if (idx >= responses.length) {
      throw new Error(
        `fetchStub: no more responses scripted (request #${idx + 1} to ${url})`,
      );
    }
    return buildResponse(responses[idx++]);
  };
  return { fetch: stub, calls };
}

function sampleOpenApi(): OpenApiSchema {
  return {
    openapi: "3.1.0",
    info: { title: "helios", version: "1.0.5" },
  };
}

function recordPayload(
  overrides: Partial<{
    id: string;
    model_id: string;
    release: string;
    schema: unknown;
    created_at: number;
    updated_at: number;
  }> = {},
): Record<string, unknown> {
  return {
    id: "cf868483-fa9f-4744-a4ce-aa2724e45f0a",
    model_id: VALID_MODEL_ID,
    release: "v1.0.5-ge6187a05",
    schema: sampleOpenApi(),
    created_at: 1747000000,
    updated_at: 1747000000,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

describe("internal helpers", () => {
  it("trimTrailingSlashes strips any number of trailing slashes", () => {
    const { trimTrailingSlashes } = __testing__;
    expect(trimTrailingSlashes("https://api.reactor.inc")).toBe(
      "https://api.reactor.inc",
    );
    expect(trimTrailingSlashes("https://api.reactor.inc/")).toBe(
      "https://api.reactor.inc",
    );
    expect(trimTrailingSlashes("https://api.reactor.inc////")).toBe(
      "https://api.reactor.inc",
    );
  });

  it("buildHeaders omits Authorization when no apiKey is supplied", () => {
    const { buildHeaders } = __testing__;
    const headers = buildHeaders(undefined);
    expect(headers.Accept).toBe("application/json");
    expect(headers.Authorization).toBeUndefined();
  });

  it("buildHeaders sets Authorization: Bearer <jwt> when a bearer token is supplied", () => {
    // The header takes a JWT, NOT a raw API key — those have different
    // shapes per REST-API.md (`Reactor-API-Key` vs `Authorization:
    // Bearer`). The exchange happens upstream in `exchangeApiKeyForJwt`.
    const { buildHeaders } = __testing__;
    expect(buildHeaders("eyJhbGciOiJIUzI1NiJ9.test").Authorization).toBe(
      "Bearer eyJhbGciOiJIUzI1NiJ9.test",
    );
  });

  it("buildHeaders pins the Reactor-API-Version header on every call", () => {
    // `Reactor-API-Version` is mandatory on `/tokens` and `/sessions`
    // per the REST docs; we send it on every coordinator call so the
    // header stays compatible if the gate ever widens to /admin/*.
    const { buildHeaders } = __testing__;
    expect(buildHeaders(undefined)["Reactor-API-Version"]).toBe("1");
    expect(buildHeaders("eyJ.x.y")["Reactor-API-Version"]).toBe("1");
  });

  it("requireUuidLike rejects obviously-broken model IDs", () => {
    const { requireUuidLike } = __testing__;
    expect(() => requireUuidLike("")).toThrow(/Invalid --model-id/);
    expect(() => requireUuidLike(" has space ")).toThrow(/Invalid --model-id/);
    expect(() => requireUuidLike("foo/bar")).toThrow(/Invalid --model-id/);
    expect(() => requireUuidLike("http://x")).toThrow(/Invalid --model-id/);
    // Any opaque token without whitespace/slashes/colons is accepted —
    // we deliberately don't enforce strict RFC 4122 formatting so the
    // coordinator remains the source of truth for its own ID format.
    expect(() => requireUuidLike(VALID_MODEL_ID)).not.toThrow();
    expect(() => requireUuidLike("not-really-a-uuid")).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Release-scoped fetch — single request, full record returned.
// ---------------------------------------------------------------------------

describe("fetchSchema — with --release", () => {
  it("hits GET /admin/models/{id}/schemas?release=<release> and returns schema.schema", async () => {
    const { fetch, calls } = makeFetchStub([
      { status: 200, body: recordPayload() },
    ]);

    const schema = await fetchSchema({
      coordinatorUrl: "https://api.reactor.inc",
      modelId: VALID_MODEL_ID,
      release: "v1.0.5",
      fetchImpl: fetch,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      `https://api.reactor.inc/admin/models/${VALID_MODEL_ID}/schemas?release=v1.0.5`,
    );
    expect((calls[0].init?.headers as Record<string, string>).Accept).toBe(
      "application/json",
    );
    expect(
      (calls[0].init?.headers as Record<string, string>).Authorization,
    ).toBeUndefined();

    expect(schema).toEqual(sampleOpenApi());
  });

  it("URL-encodes the model ID and release query parameter", async () => {
    // The coordinator's path param is a UUID so encoding is normally a
    // no-op, but we still pipe it through encodeURIComponent so a caller
    // who fat-fingers a `+` or `&` gets a clean URL instead of a silent
    // query-string break.
    const { fetch, calls } = makeFetchStub([
      { status: 200, body: recordPayload() },
    ]);

    await fetchSchema({
      coordinatorUrl: "https://api.reactor.inc/",
      modelId: VALID_MODEL_ID,
      release: "v1.0.5+build.1",
      fetchImpl: fetch,
    });

    expect(calls[0].url).toBe(
      `https://api.reactor.inc/admin/models/${VALID_MODEL_ID}/schemas?release=v1.0.5%2Bbuild.1`,
    );
  });

  it("sends Authorization: Bearer <jwt> when a pre-exchanged bearerToken is supplied", async () => {
    // `bearerToken` skips the `/tokens` exchange entirely. Useful here
    // (no need to mock two responses to assert one header) and in the
    // CLI, which exchanges once at the top of resolveSchema and reuses
    // the JWT across resolveModelIdByName + fetchSchema.
    const { fetch, calls } = makeFetchStub([
      { status: 200, body: recordPayload() },
    ]);

    await fetchSchema({
      coordinatorUrl: "https://api.reactor.inc",
      modelId: VALID_MODEL_ID,
      release: "v1.0.5",
      bearerToken: "eyJhbGciOiJIUzI1NiJ9.fake.jwt",
      fetchImpl: fetch,
    });

    expect(calls).toHaveLength(1);
    expect(
      (calls[0].init?.headers as Record<string, string>).Authorization,
    ).toBe("Bearer eyJhbGciOiJIUzI1NiJ9.fake.jwt");
  });

  it("exchanges --api-key for a JWT before the schema fetch", async () => {
    // End-to-end of the auth flow we care about: caller hands us the
    // raw API key, fetcher does POST /tokens with `Reactor-API-Key`,
    // then sends the resulting JWT as `Authorization: Bearer` on the
    // schema call. The API key MUST never appear on /admin/*.
    const { fetch, calls } = makeFetchStub([
      { status: 200, body: { jwt: "eyJ.exchanged.jwt" } },
      { status: 200, body: recordPayload() },
    ]);

    await fetchSchema({
      coordinatorUrl: "https://api.reactor.inc",
      modelId: VALID_MODEL_ID,
      release: "v1.0.5",
      apiKey: "rk_secret",
      fetchImpl: fetch,
    });

    expect(calls).toHaveLength(2);

    // First call: token exchange.
    expect(calls[0].url).toBe("https://api.reactor.inc/tokens");
    expect(calls[0].init?.method).toBe("POST");
    const tokenHeaders = calls[0].init?.headers as Record<string, string>;
    expect(tokenHeaders["Reactor-API-Key"]).toBe("rk_secret");
    expect(tokenHeaders.Authorization).toBeUndefined();

    // Second call: schema fetch — JWT, not the API key.
    const schemaHeaders = calls[1].init?.headers as Record<string, string>;
    expect(schemaHeaders.Authorization).toBe("Bearer eyJ.exchanged.jwt");
    expect(schemaHeaders["Reactor-API-Key"]).toBeUndefined();
  });

  it("strips trailing slashes from the coordinator URL", async () => {
    const { fetch, calls } = makeFetchStub([
      { status: 200, body: recordPayload() },
    ]);

    await fetchSchema({
      coordinatorUrl: "https://api.reactor.inc///",
      modelId: VALID_MODEL_ID,
      release: "v1",
      fetchImpl: fetch,
    });

    expect(calls[0].url.startsWith("https://api.reactor.inc/admin/")).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// Latest-release resolution helpers.
//
// `pickLatestRelease` is intentionally a top-level export, not an
// internal to `fetchSchema`, because the CI pipeline (and anyone else
// who wants "what's the newest published schema") should use the same
// ordering. Tests cover the comparator behaviour in isolation so the
// rules stay frozen even when the server-side `/releases?latest`
// endpoint eventually replaces the client-side sort.
// ---------------------------------------------------------------------------

describe("compareReleaseTags", () => {
  const { compareReleaseTags } = __testing__;

  it("sorts the major.minor.patch triple numerically (not lexicographically)", () => {
    // The lexicographic trap: `"v10"` < `"v2"` under string order, but
    // as a real version it's obviously newer. Numeric parsing catches it.
    expect(compareReleaseTags("v2.0.0", "v10.0.0")).toBeLessThan(0);
    expect(compareReleaseTags("v1.9.0", "v1.10.0")).toBeLessThan(0);
    expect(compareReleaseTags("v1.0.9", "v1.0.10")).toBeLessThan(0);
  });

  it("breaks ties lexicographically on the full release string", () => {
    // Same triple → fall through to the full string. This is deliberate
    // and documented: Reactor's `-g<sha>` suffixes aren't timestamp
    // ordered, but at least the comparator is *total* and stable.
    expect(
      compareReleaseTags("v1.0.5-ge6187a05", "v1.0.5-gfeedface"),
    ).toBeLessThan(0);
  });

  it("returns 0 when two tags are identical", () => {
    expect(compareReleaseTags("v1.2.3", "v1.2.3")).toBe(0);
  });

  it("accepts a missing `v` prefix on either side", () => {
    // Both `v1.2.3` and `1.2.3` are valid inputs — PR 6's Buildkite
    // pipeline wants to plug npm's plain-semver output straight into
    // the comparator for cross-checking.
    expect(compareReleaseTags("1.2.3", "v1.2.3")).toBe(0);
    expect(compareReleaseTags("1.2.3", "v1.2.4")).toBeLessThan(0);
  });

  it("sorts unparseable tags before any parseable one", () => {
    // "garbage release" must never beat a valid semver — otherwise a
    // malformed row in the coordinator could steal the "latest" slot.
    expect(compareReleaseTags("garbage", "v0.0.1")).toBeLessThan(0);
    expect(compareReleaseTags("v0.0.1", "garbage")).toBeGreaterThan(0);
  });
});

describe("pickLatestRelease", () => {
  it("returns null for an empty list", () => {
    expect(pickLatestRelease([])).toBeNull();
  });

  it("returns the single entry when there's only one", () => {
    const only = { id: "a", release: "v1.0.0" };
    expect(pickLatestRelease([only])).toBe(only);
  });

  it("picks the highest semver regardless of array position", () => {
    const summaries = [
      { id: "a", release: "v1.0.4" },
      { id: "b", release: "v2.3.0" },
      { id: "c", release: "v1.9.9" },
      { id: "d", release: "v2.2.9" },
    ];
    expect(pickLatestRelease(summaries)?.id).toBe("b");
  });

  it("prefers a valid semver over an unparseable tag", () => {
    const summaries = [
      { id: "valid", release: "v1.0.0" },
      { id: "junk", release: "nightly" },
    ];
    expect(pickLatestRelease(summaries)?.id).toBe("valid");
  });

  it("handles Reactor's g<sha> suffixes in the tie-break lexicographically", () => {
    const summaries = [
      { id: "older", release: "v1.0.5-ge6187a05" },
      { id: "newer", release: "v1.0.5-gfeedface" },
    ];
    // `gfeedface` > `ge6187a05` lexicographically. Documented caveat:
    // this is stable but not timestamp order. Good enough today.
    expect(pickLatestRelease(summaries)?.id).toBe("newer");
  });
});

// ---------------------------------------------------------------------------
// List + pick-latest-by-semver — two requests, highest semver wins.
//
// The picker deliberately doesn't trust list order (the REST contract
// doesn't promise one), so these tests interleave releases to prove the
// client-side comparator is what selects the latest.
// ---------------------------------------------------------------------------

describe("fetchSchema — without --release", () => {
  it("lists summaries and fetches the entry with the highest semver", async () => {
    const latestId = "cf868483-fa9f-4744-a4ce-aa2724e45f0a";
    const { fetch, calls } = makeFetchStub([
      {
        status: 200,
        // Intentional: the "highest" entry is in the middle of the list,
        // not at index 0. Proves we're sorting, not relying on list order.
        body: [
          { id: "b0c6a11d-feed-face-0000-000000000000", release: "v1.0.4" },
          { id: latestId, release: "v1.0.5-ge6187a05" },
          { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", release: "v1.0.3" },
        ],
      },
      { status: 200, body: recordPayload({ id: latestId }) },
    ]);

    const schema = await fetchSchema({
      coordinatorUrl: "https://api.reactor.inc",
      modelId: VALID_MODEL_ID,
      fetchImpl: fetch,
    });

    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe(
      `https://api.reactor.inc/admin/models/${VALID_MODEL_ID}/schemas`,
    );
    expect(calls[1].url).toBe(
      `https://api.reactor.inc/admin/models/${VALID_MODEL_ID}/schemas/${latestId}`,
    );

    expect(schema).toEqual(sampleOpenApi());
  });

  it("throws a helpful error when the list endpoint returns []", async () => {
    const { fetch } = makeFetchStub([{ status: 200, body: [] }]);

    await expect(
      fetchSchema({
        coordinatorUrl: "https://api.reactor.inc",
        modelId: VALID_MODEL_ID,
        fetchImpl: fetch,
      }),
    ).rejects.toThrow(/No schemas registered for model/);
  });

  it("passes the same JWT through on both the list and detail requests", async () => {
    // We exchange once at the top of fetchSchema; the resulting JWT
    // must reach BOTH the `/schemas` list call and the
    // `/schemas/{id}` follow-up. Pre-supplying `bearerToken` skips
    // the exchange so this test stays focused on the propagation.
    const { fetch, calls } = makeFetchStub([
      { status: 200, body: [{ id: "abc", release: "v1" }] },
      { status: 200, body: recordPayload({ id: "abc" }) },
    ]);

    await fetchSchema({
      coordinatorUrl: "https://api.reactor.inc",
      modelId: VALID_MODEL_ID,
      bearerToken: "eyJ.fake.jwt",
      fetchImpl: fetch,
    });

    for (const call of calls) {
      expect((call.init?.headers as Record<string, string>).Authorization).toBe(
        "Bearer eyJ.fake.jwt",
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Error paths — the CLI's user-facing error messages are generated here,
// so the wording is part of the contract we assert on.
// ---------------------------------------------------------------------------

describe("fetchSchema — HTTP error surfaces", () => {
  it("maps 401 to a credentials-hint error", async () => {
    const { fetch } = makeFetchStub([
      { status: 401, body: "unauthorized", statusText: "Unauthorized" },
    ]);

    await expect(
      fetchSchema({
        coordinatorUrl: "https://api.reactor.inc",
        modelId: VALID_MODEL_ID,
        release: "v1",
        fetchImpl: fetch,
      }),
    ).rejects.toThrow(/401.*--api-key.*REACTOR_API_KEY/s);
  });

  it("maps 403 to a role-hint error", async () => {
    const { fetch } = makeFetchStub([
      { status: 403, body: "forbidden", statusText: "Forbidden" },
    ]);

    await expect(
      fetchSchema({
        coordinatorUrl: "https://api.reactor.inc",
        modelId: VALID_MODEL_ID,
        release: "v1",
        fetchImpl: fetch,
      }),
    ).rejects.toThrow(/403.*lacks the required role/);
  });

  it("maps 404 to a message that covers both 'unknown model' and 'private model' cases", async () => {
    // The coordinator deliberately collapses both into 404 (see
    // REST-API.md § Access Control), so the error message must hint at
    // both — misleading users toward only one is a support footgun.
    const { fetch } = makeFetchStub([
      { status: 404, body: "not found", statusText: "Not Found" },
    ]);

    await expect(
      fetchSchema({
        coordinatorUrl: "https://api.reactor.inc",
        modelId: VALID_MODEL_ID,
        release: "v99",
        fetchImpl: fetch,
      }),
    ).rejects.toThrow(
      /404.*model ID is wrong.*no schema is registered.*private/s,
    );
  });

  it("maps 5xx to a generic status-code message with the body snippet", async () => {
    const { fetch } = makeFetchStub([
      { status: 503, body: "upstream boom", statusText: "Service Unavailable" },
    ]);

    await expect(
      fetchSchema({
        coordinatorUrl: "https://api.reactor.inc",
        modelId: VALID_MODEL_ID,
        release: "v1",
        fetchImpl: fetch,
      }),
    ).rejects.toThrow(/503 Service Unavailable.*upstream boom/s);
  });

  it("wraps network failures with the target URL", async () => {
    const boom: typeof fetch = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });

    await expect(
      fetchSchema({
        coordinatorUrl: "https://api.reactor.inc",
        modelId: VALID_MODEL_ID,
        release: "v1",
        fetchImpl: boom,
      }),
    ).rejects.toThrow(/Failed to reach coordinator at.*fetch failed/s);
  });

  it("rejects a record payload that is missing the schema object", async () => {
    const { fetch } = makeFetchStub([
      { status: 200, body: { id: "abc", release: "v1" } },
    ]);

    await expect(
      fetchSchema({
        coordinatorUrl: "https://api.reactor.inc",
        modelId: VALID_MODEL_ID,
        release: "v1",
        fetchImpl: fetch,
      }),
    ).rejects.toThrow(/unexpected payload shape/);
  });

  it("rejects a list payload that is not an array", async () => {
    const { fetch } = makeFetchStub([{ status: 200, body: { not: "a list" } }]);

    await expect(
      fetchSchema({
        coordinatorUrl: "https://api.reactor.inc",
        modelId: VALID_MODEL_ID,
        fetchImpl: fetch,
      }),
    ).rejects.toThrow(/expected an array of \{id, release\} summaries/);
  });

  it("rejects a malformed --model-id before making any request", async () => {
    const { fetch, calls } = makeFetchStub([]);

    await expect(
      fetchSchema({
        coordinatorUrl: "https://api.reactor.inc",
        modelId: "bad/id",
        release: "v1",
        fetchImpl: fetch,
      }),
    ).rejects.toThrow(/Invalid --model-id/);

    // No requests should have gone out — the guard is strictly pre-IO.
    expect(calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// API key → JWT exchange.
//
// The standalone counterpart of the apiKey-handling tests above.
// `POST /tokens` is the only endpoint that consumes a Reactor API key
// (`Reactor-API-Key: rk_...`); every other endpoint takes a JWT
// (`Authorization: Bearer eyJ...`). This describe pins the wire shape
// of that exchange so the rest of the fetcher can keep working in
// JWTs from here on.
// ---------------------------------------------------------------------------

describe("exchangeApiKeyForJwt", () => {
  it("POSTs to /tokens with the Reactor-API-Key header and returns the JWT", async () => {
    const { fetch, calls } = makeFetchStub([
      { status: 200, body: { jwt: "eyJ.fresh.jwt" } },
    ]);

    const jwt = await exchangeApiKeyForJwt({
      coordinatorUrl: "https://api.reactor.inc",
      apiKey: "rk_secret",
      fetchImpl: fetch,
    });

    expect(jwt).toBe("eyJ.fresh.jwt");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.reactor.inc/tokens");
    expect(calls[0].init?.method).toBe("POST");
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers["Reactor-API-Key"]).toBe("rk_secret");
    // Critically: NEVER use Authorization on /tokens — the API key is
    // not a JWT, sending it that way would be a category error and
    // some validators would reject it outright.
    expect(headers.Authorization).toBeUndefined();
    expect(headers["Reactor-API-Version"]).toBe("1");
  });

  it("strips trailing slashes from the coordinator URL", async () => {
    const { fetch, calls } = makeFetchStub([
      { status: 200, body: { jwt: "eyJ.x.y" } },
    ]);

    await exchangeApiKeyForJwt({
      coordinatorUrl: "https://api.reactor.inc///",
      apiKey: "rk_secret",
      fetchImpl: fetch,
    });

    expect(calls[0].url).toBe("https://api.reactor.inc/tokens");
  });

  it("rejects an empty --api-key before making any request", async () => {
    const { fetch, calls } = makeFetchStub([]);

    await expect(
      exchangeApiKeyForJwt({
        coordinatorUrl: "https://api.reactor.inc",
        apiKey: "",
        fetchImpl: fetch,
      }),
    ).rejects.toThrow(/Invalid --api-key/);
    expect(calls).toHaveLength(0);
  });

  it("maps 401 to the same actionable wording as the rest of the fetcher", async () => {
    const { fetch } = makeFetchStub([
      { status: 401, body: "bad key", statusText: "Unauthorized" },
    ]);

    await expect(
      exchangeApiKeyForJwt({
        coordinatorUrl: "https://api.reactor.inc",
        apiKey: "rk_secret",
        fetchImpl: fetch,
      }),
    ).rejects.toThrow(/401.*--api-key.*REACTOR_API_KEY/s);
  });

  it("rejects a 200 with a payload missing the `jwt` field", async () => {
    const { fetch } = makeFetchStub([
      { status: 200, body: { token: "eyJ.x.y" } },
    ]);

    await expect(
      exchangeApiKeyForJwt({
        coordinatorUrl: "https://api.reactor.inc",
        apiKey: "rk_secret",
        fetchImpl: fetch,
      }),
    ).rejects.toThrow(/unexpected \/tokens payload shape/);
  });

  it("wraps network failures with the target URL", async () => {
    const boom: typeof fetch = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });

    await expect(
      exchangeApiKeyForJwt({
        coordinatorUrl: "https://api.reactor.inc",
        apiKey: "rk_secret",
        fetchImpl: boom,
      }),
    ).rejects.toThrow(
      /Failed to reach coordinator at.*\/tokens.*fetch failed/s,
    );
  });
});

// ---------------------------------------------------------------------------
// Model name → UUID resolution.
//
// `GET /admin/models` is admin-only, so this path requires an API key.
// The resolver exists so the CLI (and periodic CI) can work in model
// names rather than UUIDs, which humans and committed config files
// always think in.
// ---------------------------------------------------------------------------

describe("resolveModelIdByName", () => {
  it("returns the id of the matching model summary", async () => {
    // Pre-supplying `bearerToken` keeps this test focused on the
    // resolver semantics (one /admin/models call → match by name);
    // the apiKey → JWT exchange is covered in its own test below.
    const { fetch, calls } = makeFetchStub([
      {
        status: 200,
        body: [
          { id: "7b3f1bc2-a4e5-4d78-b9c1-123456789abc", name: "helios" },
          { id: "9e2a3dc4-beef-dead-face-000000000000", name: "morpheus" },
        ],
      },
    ]);

    const id = await resolveModelIdByName({
      coordinatorUrl: "https://api.reactor.inc",
      modelName: "morpheus",
      bearerToken: "eyJ.admin.jwt",
      fetchImpl: fetch,
    });

    expect(id).toBe("9e2a3dc4-beef-dead-face-000000000000");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.reactor.inc/admin/models");
    expect(
      (calls[0].init?.headers as Record<string, string>).Authorization,
    ).toBe("Bearer eyJ.admin.jwt");
  });

  it("exchanges --api-key for a JWT before listing models", async () => {
    const { fetch, calls } = makeFetchStub([
      { status: 200, body: { jwt: "eyJ.exchanged.jwt" } },
      { status: 200, body: [{ id: "7b3f1bc2-…", name: "helios" }] },
    ]);

    await resolveModelIdByName({
      coordinatorUrl: "https://api.reactor.inc",
      modelName: "helios",
      apiKey: "rk_admin",
      fetchImpl: fetch,
    });

    expect(calls).toHaveLength(2);
    // Step 1: token exchange via the dedicated header.
    expect(calls[0].url).toBe("https://api.reactor.inc/tokens");
    const tokenHeaders = calls[0].init?.headers as Record<string, string>;
    expect(tokenHeaders["Reactor-API-Key"]).toBe("rk_admin");
    // Step 2: /admin/models with the JWT, no API key.
    const adminHeaders = calls[1].init?.headers as Record<string, string>;
    expect(adminHeaders.Authorization).toBe("Bearer eyJ.exchanged.jwt");
    expect(adminHeaders["Reactor-API-Key"]).toBeUndefined();
  });

  it("is case-sensitive and does not match on prefix", async () => {
    // Case-folding or prefix-matching would be surprising and would let
    // a rename accidentally start republishing under the old slug.
    const { fetch } = makeFetchStub([
      {
        status: 200,
        body: [{ id: "7b3f1bc2-a4e5-4d78-b9c1-123456789abc", name: "helios" }],
      },
    ]);

    await expect(
      resolveModelIdByName({
        coordinatorUrl: "https://api.reactor.inc",
        modelName: "Helios",
        fetchImpl: fetch,
      }),
    ).rejects.toThrow(/No model named "Helios" registered on the coordinator/);
  });

  it("surfaces a clear error when no model matches", async () => {
    const { fetch } = makeFetchStub([
      { status: 200, body: [{ id: "a", name: "helios" }] },
    ]);

    await expect(
      resolveModelIdByName({
        coordinatorUrl: "https://api.reactor.inc",
        modelName: "ghost",
        fetchImpl: fetch,
      }),
    ).rejects.toThrow(/No model named "ghost"/);
  });

  it("rejects an empty --model string before making any request", async () => {
    const { fetch, calls } = makeFetchStub([]);

    await expect(
      resolveModelIdByName({
        coordinatorUrl: "https://api.reactor.inc",
        modelName: "",
        fetchImpl: fetch,
      }),
    ).rejects.toThrow(/Invalid --model/);

    expect(calls).toHaveLength(0);
  });

  it("surfaces 401 through the same error wording as fetchSchema", async () => {
    // `/admin/models` is admin-only, so an unauthenticated caller gets
    // 401 and the resolver must surface the same actionable hint as
    // the rest of the coordinator fetcher.
    const { fetch } = makeFetchStub([
      { status: 401, body: "unauthorized", statusText: "Unauthorized" },
    ]);

    await expect(
      resolveModelIdByName({
        coordinatorUrl: "https://api.reactor.inc",
        modelName: "helios",
        fetchImpl: fetch,
      }),
    ).rejects.toThrow(/401.*--api-key.*REACTOR_API_KEY/s);
  });
});
