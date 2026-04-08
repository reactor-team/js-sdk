// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

/**
 * Optional OpenTelemetry instrumentation for the Reactor JS-SDK.
 *
 * When @opentelemetry/api is installed and a TracerProvider is registered,
 * this module creates spans for every coordinator HTTP call and injects
 * W3C traceparent headers for distributed tracing. When the package is
 * absent or telemetry is disabled (local mode), every function is a no-op.
 */

import { REACTOR_SDK_VERSION } from "./types";

// ---------------------------------------------------------------------------
// Minimal type stubs matching @opentelemetry/api so we don't need the import
// at compile time. The actual module is resolved lazily at runtime.
// ---------------------------------------------------------------------------

interface OtelSpan {
  setAttribute(key: string, value: string | number | boolean): this;
  setStatus(status: { code: number; message?: string }): this;
  recordException(error: unknown): void;
  end(): void;
}

interface OtelTracer {
  startActiveSpan<T>(
    name: string,
    options: Record<string, unknown>,
    fn: (span: OtelSpan) => T
  ): T;
  startActiveSpan<T>(name: string, fn: (span: OtelSpan) => T): T;
}

interface OtelApi {
  trace: {
    getTracer(name: string, version?: string): OtelTracer;
  };
  context: {
    active(): unknown;
  };
  propagation: {
    inject(context: unknown, carrier: Record<string, string>): void;
  };
  SpanStatusCode: { ERROR: number };
}

// ---------------------------------------------------------------------------
// Lazy async resolution of @opentelemetry/api.
//
// Uses dynamic import() so bundlers (webpack, vite) can resolve the module
// from the consuming app's node_modules. If the package isn't installed,
// the import fails and telemetry stays permanently disabled.
//
// The resolved API is cached after the first successful import. Detection
// is checked on every tracedFetch/withSpan call via getApi(), which returns
// the cached value synchronously once resolved.
// ---------------------------------------------------------------------------

let cachedApi: OtelApi | null | undefined; // undefined = not yet tried
let resolvePromise: Promise<void> | undefined;

function tryResolve(): Promise<void> {
  if (!resolvePromise) {
    resolvePromise = import("@opentelemetry/api")
      .then((mod) => {
        cachedApi = mod as unknown as OtelApi;
        console.debug("[Reactor:Telemetry] @opentelemetry/api resolved", {
          hasTrace: !!cachedApi?.trace,
          hasContext: !!cachedApi?.context,
          hasPropagation: !!cachedApi?.propagation,
        });
      })
      .catch((err) => {
        cachedApi = null;
        console.debug(
          "[Reactor:Telemetry] @opentelemetry/api not available:",
          err
        );
      });
  }
  return resolvePromise;
}

// Kick off resolution immediately at module load time.
tryResolve();

function getApi(): OtelApi | undefined {
  if (cachedApi === undefined) return undefined; // still resolving
  return cachedApi ?? undefined;
}

let enabled = true;

/**
 * Module-level kill switch. Called by Reactor when `local: true`.
 */
export function setEnabled(flag: boolean): void {
  enabled = flag;
}

function getTracer(): OtelTracer | undefined {
  if (!enabled) return undefined;
  const api = getApi();
  if (!api) return undefined;
  return api.trace.getTracer("@reactor-team/js-sdk", REACTOR_SDK_VERSION);
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

const SPAN_STATUS_ERROR = 2;

/**
 * Wraps `fetch()` with an OTEL span and W3C traceparent header injection.
 * When telemetry is unavailable or disabled, delegates directly to `fetch()`.
 */
export function tracedFetch(
  spanName: string,
  url: string | URL | Request,
  init?: RequestInit
): Promise<Response> {
  const api = getApi();
  const tracer = getTracer();
  if (!tracer || !api) {
    console.debug("[Reactor:Telemetry] tracedFetch BYPASS", spanName, {
      enabled,
      apiState: cachedApi === undefined ? "resolving" : cachedApi === null ? "unavailable" : "ready",
      hasTracer: !!tracer,
    });
    return fetch(url, init);
  }
  console.debug("[Reactor:Telemetry] tracedFetch ACTIVE", spanName);

  const method = init?.method ?? "GET";

  return tracer.startActiveSpan(spanName, {}, (span: OtelSpan) => {
    const headers: Record<string, string> = {};
    const existing = init?.headers;
    if (existing) {
      if (existing instanceof Headers) {
        existing.forEach((v, k) => {
          headers[k] = v;
        });
      } else if (Array.isArray(existing)) {
        for (const [k, v] of existing) headers[k] = v;
      } else {
        Object.assign(headers, existing);
      }
    }

    api.propagation.inject(api.context.active(), headers);

    span.setAttribute("http.method", method);
    span.setAttribute("http.url", String(url));

    return fetch(url, { ...init, headers })
      .then((response) => {
        span.setAttribute("http.status_code", response.status);
        if (!response.ok) {
          span.setStatus({
            code: SPAN_STATUS_ERROR,
            message: `HTTP ${response.status}`,
          });
        }
        span.end();
        return response;
      })
      .catch((error) => {
        span.recordException(error);
        span.setStatus({ code: SPAN_STATUS_ERROR });
        span.end();
        throw error;
      });
  });
}

/**
 * Wraps an async function in an OTEL span. When telemetry is unavailable
 * or disabled, just calls `fn()` directly.
 */
export function withSpan<T>(
  spanName: string,
  attrs: Record<string, string | number | boolean>,
  fn: () => Promise<T>
): Promise<T> {
  const tracer = getTracer();
  if (!tracer) {
    return fn();
  }

  return tracer.startActiveSpan(spanName, {}, (span: OtelSpan) => {
    for (const [k, v] of Object.entries(attrs)) {
      span.setAttribute(k, v);
    }

    return fn()
      .then((result) => {
        span.end();
        return result;
      })
      .catch((error) => {
        span.recordException(error);
        span.setStatus({ code: SPAN_STATUS_ERROR });
        span.end();
        throw error;
      });
  });
}
