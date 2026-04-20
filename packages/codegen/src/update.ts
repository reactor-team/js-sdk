// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

import { __testing__ as coordinatorTesting } from "./coordinator.js";

// ---------------------------------------------------------------------------
// Update decision — given the schema version and the currently-published
// npm version, decide what the CI should do.
//
// Rules the CI pipeline cares about:
//   - npm has no record        → first publish, go ahead
//   - npm version < schema     → newer schema, republish
//   - npm version = schema     → up to date, no-op
//   - npm version > schema     → regression, refuse and fail loudly
//
// The "refuse" case is the value-add of having this live in the codegen:
// it's the state that means "someone accidentally bumped npm without
// bumping the coordinator schema, and re-running the pipeline would be
// a silent downgrade". We never want that to happen quietly.
// ---------------------------------------------------------------------------

export type UpdateReason = "first-publish" | "newer-schema" | "up-to-date";

export interface UpdateDecision {
  /** True when the CI should proceed to pack + publish. */
  publishNeeded: boolean;
  /** Tag explaining which branch fired (see `UpdateReason`). */
  reason: UpdateReason;
  /** Version we'd publish — always the generated schema's version. */
  targetVersion: string;
  /** What's on npm today; `null` when the package has never been published. */
  currentVersion: string | null;
}

/**
 * Thrown by {@link decideUpdate} when npm has a *higher* version than
 * the coordinator schema. Keeping a dedicated error type means the CLI
 * can map this to a dedicated exit code (2) so pipeline wrappers can
 * distinguish "legitimate skip" from "regression detected".
 */
export class NpmRegressionError extends Error {
  constructor(
    public readonly packageName: string,
    public readonly schemaVersion: string,
    public readonly npmVersion: string,
  ) {
    super(
      `Refusing to publish ${packageName}: npm has version ${npmVersion}, ` +
        `which is higher than the coordinator schema version ${schemaVersion}. ` +
        `Someone probably published manually without updating the schema — ` +
        `re-running this pipeline would silently downgrade the package.`,
    );
    this.name = "NpmRegressionError";
  }
}

/**
 * Compare a locally-generated schema version against the
 * currently-published npm version and return a decision. Pure; all
 * I/O happens in the caller via {@link getPublishedNpmVersion}.
 */
export function decideUpdate(
  packageName: string,
  schemaVersion: string,
  npmVersion: string | null,
): UpdateDecision {
  if (npmVersion === null) {
    return {
      publishNeeded: true,
      reason: "first-publish",
      targetVersion: schemaVersion,
      currentVersion: null,
    };
  }

  const cmp = coordinatorTesting.compareReleaseTags(schemaVersion, npmVersion);

  if (cmp > 0) {
    return {
      publishNeeded: true,
      reason: "newer-schema",
      targetVersion: schemaVersion,
      currentVersion: npmVersion,
    };
  }

  if (cmp === 0) {
    return {
      publishNeeded: false,
      reason: "up-to-date",
      targetVersion: schemaVersion,
      currentVersion: npmVersion,
    };
  }

  throw new NpmRegressionError(packageName, schemaVersion, npmVersion);
}

// ---------------------------------------------------------------------------
// npm registry lookup.
//
// Public npm packages don't need auth to query — we hit the JSON API
// directly rather than shelling out to `npm view`. Keeps this testable
// against a stubbed fetch and avoids dragging npm onto the Buildkite
// agent's PATH for the check step.
// ---------------------------------------------------------------------------

export interface GetPublishedNpmVersionOptions {
  /**
   * Registry base URL, defaults to `https://registry.npmjs.org`. The
   * override exists for tests and (in the future) private registries;
   * production publishes always target npmjs.org.
   */
  registryUrl?: string;
  /** Injection seam — defaults to the global `fetch` (Node 18+). */
  fetchImpl?: typeof fetch;
}

/**
 * Read the `latest` dist-tag version for a scoped npm package.
 * Returns `null` when the package has never been published (404) —
 * the caller treats that as "first publish" rather than an error.
 *
 * Throws for any other non-OK status so the CI sees transient registry
 * trouble as a failure rather than silently degrading to "first publish".
 */
export async function getPublishedNpmVersion(
  packageName: string,
  options: GetPublishedNpmVersionOptions = {},
): Promise<string | null> {
  const registryUrl = (
    options.registryUrl ?? "https://registry.npmjs.org"
  ).replace(/\/+$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;
  // npm's registry accepts the scoped package name URL-encoded as
  // `@scope%2Fname`, but also tolerates a bare `@scope/name` for GET —
  // we encode each segment separately to stay safe if the name ever
  // contains unexpected characters.
  const parts = packageName.split("/");
  const url = `${registryUrl}/${parts.map(encodeURIComponent).join("/")}/latest`;

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to reach npm registry at ${url}: ${msg}`);
  }

  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    let body = "";
    try {
      body = (await response.text()).slice(0, 500);
    } catch {
      /* swallow body read errors — status already tells the story */
    }
    throw new Error(
      `npm registry responded ${response.status} ${response.statusText} ` +
        `for ${packageName}${body ? `: ${body}` : ""}`,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `npm registry returned non-JSON body for ${packageName}: ${msg}`,
    );
  }

  if (
    !payload ||
    typeof payload !== "object" ||
    typeof (payload as { version?: unknown }).version !== "string"
  ) {
    throw new Error(
      `npm registry returned an unexpected payload shape for ${packageName} ` +
        `(expected {version: string})`,
    );
  }
  return (payload as { version: string }).version;
}
