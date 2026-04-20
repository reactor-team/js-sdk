// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

import { describe, expect, it, vi } from "vitest";

import {
  NpmRegressionError,
  decideUpdate,
  getPublishedNpmVersion,
} from "../src/update.js";

// ---------------------------------------------------------------------------
// Fetch stub — same shape as coordinator.test.ts so the two files share
// a mental model for HTTP mocking. We don't import the helper from
// there to keep the test file self-contained.
// ---------------------------------------------------------------------------

interface Call {
  url: string;
  init?: RequestInit;
}

interface StubResponse {
  status: number;
  body: unknown;
  statusText?: string;
}

function buildResponse(r: StubResponse): Response {
  return new Response(
    typeof r.body === "string" ? r.body : JSON.stringify(r.body),
    {
      status: r.status,
      statusText: r.statusText ?? (r.status === 200 ? "OK" : ""),
      headers: { "Content-Type": "application/json" },
    },
  );
}

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

// ---------------------------------------------------------------------------
// decideUpdate — pure decision table. The whole point of extracting this
// out of the CI pipeline's bash is so every branch is exercised in
// isolation with a unit test rather than by a live npm publish.
// ---------------------------------------------------------------------------

describe("decideUpdate", () => {
  it("fires `first-publish` when npm has no record yet", () => {
    const decision = decideUpdate("@reactor-models/helios", "1.0.0", null);
    expect(decision).toEqual({
      publishNeeded: true,
      reason: "first-publish",
      targetVersion: "1.0.0",
      currentVersion: null,
    });
  });

  it("fires `newer-schema` when the coordinator is ahead of npm", () => {
    const decision = decideUpdate("@reactor-models/helios", "1.0.5", "1.0.4");
    expect(decision).toEqual({
      publishNeeded: true,
      reason: "newer-schema",
      targetVersion: "1.0.5",
      currentVersion: "1.0.4",
    });
  });

  it("fires `up-to-date` (and skips publish) when npm matches", () => {
    const decision = decideUpdate("@reactor-models/helios", "1.0.5", "1.0.5");
    expect(decision.publishNeeded).toBe(false);
    expect(decision.reason).toBe("up-to-date");
  });

  it("throws NpmRegressionError when npm is strictly newer than the schema", () => {
    // This is the "someone published manually without bumping the
    // coordinator schema" case. Republishing would silently downgrade,
    // so decideUpdate is the single gate that prevents that.
    expect(() =>
      decideUpdate("@reactor-models/helios", "1.0.5", "1.0.6"),
    ).toThrowError(NpmRegressionError);
  });

  it("compares numerically so 1.10.0 beats 1.9.0 (regression trap)", () => {
    // Lexicographic ordering would say "1.10.0" < "1.9.0" and flip the
    // regression classification. `compareReleaseTags` already handles
    // this, but the shape of the test pins the invariant at the public
    // decideUpdate level too.
    expect(
      decideUpdate("@reactor-models/helios", "1.10.0", "1.9.0").publishNeeded,
    ).toBe(true);
    expect(() =>
      decideUpdate("@reactor-models/helios", "1.9.0", "1.10.0"),
    ).toThrowError(NpmRegressionError);
  });

  it("NpmRegressionError carries the three fields a pipeline operator needs", () => {
    try {
      decideUpdate("@reactor-models/helios", "1.0.5", "1.0.6");
      expect.fail("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(NpmRegressionError);
      const e = err as NpmRegressionError;
      expect(e.packageName).toBe("@reactor-models/helios");
      expect(e.schemaVersion).toBe("1.0.5");
      expect(e.npmVersion).toBe("1.0.6");
      // Error message mentions both versions so the Buildkite log alone
      // is enough to diagnose.
      expect(e.message).toContain("1.0.5");
      expect(e.message).toContain("1.0.6");
    }
  });
});

// ---------------------------------------------------------------------------
// getPublishedNpmVersion — npm registry HTTP integration.
//
// We hit `https://registry.npmjs.org/<pkg>/latest` directly rather than
// shelling out to `npm view`, which keeps this layer dependency-free
// and lets us pin all four status-code branches against a mocked fetch.
// ---------------------------------------------------------------------------

describe("getPublishedNpmVersion", () => {
  it("returns the latest-tagged version on a 200", async () => {
    const { fetch, calls } = makeFetchStub([
      {
        status: 200,
        body: { name: "@reactor-models/helios", version: "1.0.5" },
      },
    ]);

    const v = await getPublishedNpmVersion("@reactor-models/helios", {
      fetchImpl: fetch,
    });

    expect(v).toBe("1.0.5");
    expect(calls[0].url).toBe(
      "https://registry.npmjs.org/%40reactor-models/helios/latest",
    );
    expect((calls[0].init?.headers as Record<string, string>).Accept).toBe(
      "application/json",
    );
  });

  it("returns null on 404 so the caller can treat it as first-publish", async () => {
    const { fetch } = makeFetchStub([
      { status: 404, body: { error: "Not found" }, statusText: "Not Found" },
    ]);
    expect(
      await getPublishedNpmVersion("@reactor-models/ghost", {
        fetchImpl: fetch,
      }),
    ).toBeNull();
  });

  it("throws on 5xx rather than silently degrading to first-publish", async () => {
    // If we returned null for any non-200, a transient registry outage
    // would look like "package missing" and the CI would republish
    // stale bits. Hard-fail is the right default.
    const { fetch } = makeFetchStub([
      { status: 503, body: "maintenance", statusText: "Service Unavailable" },
    ]);

    await expect(
      getPublishedNpmVersion("@reactor-models/helios", { fetchImpl: fetch }),
    ).rejects.toThrow(/503 Service Unavailable.*maintenance/s);
  });

  it("wraps network failures with the target URL", async () => {
    const boom: typeof fetch = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });

    await expect(
      getPublishedNpmVersion("@reactor-models/helios", { fetchImpl: boom }),
    ).rejects.toThrow(/Failed to reach npm registry at.*fetch failed/s);
  });

  it("rejects a 200 with a payload missing `version`", async () => {
    const { fetch } = makeFetchStub([
      { status: 200, body: { name: "helios" } },
    ]);
    await expect(
      getPublishedNpmVersion("@reactor-models/helios", { fetchImpl: fetch }),
    ).rejects.toThrow(/unexpected payload shape/);
  });

  it("accepts an unscoped package name (no slash to split)", async () => {
    // Scoped packages are the production path, but the URL construction
    // shouldn't break on `reactor-codegen` style names — regression guard.
    const { fetch, calls } = makeFetchStub([
      { status: 200, body: { version: "2.9.1" } },
    ]);
    expect(
      await getPublishedNpmVersion("reactor-codegen", { fetchImpl: fetch }),
    ).toBe("2.9.1");
    expect(calls[0].url).toBe(
      "https://registry.npmjs.org/reactor-codegen/latest",
    );
  });

  it("honours a custom registryUrl and strips trailing slashes", async () => {
    const { fetch, calls } = makeFetchStub([
      { status: 200, body: { version: "1.0.0" } },
    ]);
    await getPublishedNpmVersion("@reactor-models/helios", {
      registryUrl: "https://npm.internal/",
      fetchImpl: fetch,
    });
    expect(calls[0].url).toBe(
      "https://npm.internal/%40reactor-models/helios/latest",
    );
  });
});
