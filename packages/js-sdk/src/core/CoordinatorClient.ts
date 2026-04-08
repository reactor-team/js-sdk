// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

/**
 * The CoordinatorClient handles session lifecycle via HTTP requests.
 *
 * Transport signaling (ICE servers, SDP exchange) is NOT handled here —
 * that responsibility belongs to the TransportClient implementations.
 */

import {
  type CreateSessionRequest,
  type CreateSessionResponse,
  type SessionResponse,
  type SessionInfoResponse,
  type TerminateSessionRequest,
  CreateSessionResponseSchema,
  SessionResponseSchema,
  SessionInfoResponseSchema,
  SessionState,
  REACTOR_API_VERSION,
  REACTOR_SDK_VERSION,
  REACTOR_SDK_TYPE,
  REACTOR_WEBRTC_VERSION,
  API_VERSION_HEADER,
  API_ACCEPT_VERSION_HEADER,
  VERSION_ERROR_CODES,
} from "./types";
import { AbortError } from "../types";

const SESSION_POLL_INITIAL_BACKOFF_MS = 50;
const SESSION_POLL_MAX_BACKOFF_MS = 10_000;
const SESSION_POLL_BACKOFF_MULTIPLIER = 1.5;
const SESSION_POLL_DEFAULT_MAX_ATTEMPTS = 30;

export interface CoordinatorClientOptions {
  baseUrl: string;
  jwtToken: string;
  model: string;
}

export class CoordinatorClient {
  protected readonly baseUrl: string;
  private jwtToken: string;
  protected readonly model: string;
  protected currentSessionId?: string;
  private abortController: AbortController;

  constructor(options: CoordinatorClientOptions) {
    this.baseUrl = options.baseUrl;
    this.jwtToken = options.jwtToken;
    this.model = options.model;
    this.abortController = new AbortController();
  }

  /**
   * Aborts any in-flight HTTP requests.
   * A fresh AbortController is created so the client remains reusable.
   */
  abort(): void {
    this.abortController.abort();
    this.abortController = new AbortController();
  }

  /**
   * The current abort signal, passed to every fetch() call.
   * Protected so subclasses can forward it to their own fetch calls.
   */
  protected get signal(): AbortSignal {
    return this.abortController.signal;
  }

  /**
   * Returns authorization + versioning headers for all coordinator requests.
   */
  protected getHeaders(): HeadersInit {
    return {
      Authorization: `Bearer ${this.jwtToken}`,
      [API_VERSION_HEADER]: String(REACTOR_API_VERSION),
      [API_ACCEPT_VERSION_HEADER]: String(REACTOR_API_VERSION),
    };
  }

  /**
   * Checks an HTTP response for version mismatch errors (426, 501).
   * Logs a clear message and throws with a descriptive error code.
   */
  protected async checkVersionMismatch(response: Response): Promise<void> {
    if (response.status === 426) {
      const msg =
        `Client API version (${REACTOR_API_VERSION}) is too old. ` +
        `Server requires a newer version. Please upgrade @reactor-team/js-sdk.`;
      console.error(`[Reactor]`, msg);
      throw new Error(`${VERSION_ERROR_CODES[426]}: ${msg}`);
    }

    if (response.status === 501) {
      const msg =
        `Server does not support API version ${REACTOR_API_VERSION}. ` +
        `The server may need to be updated.`;
      console.error(`[Reactor]`, msg);
      throw new Error(`${VERSION_ERROR_CODES[501]}: ${msg}`);
    }
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const { signal } = this;
      if (signal.aborted) {
        reject(new AbortError("Sleep aborted"));
        return;
      }
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      }, ms);
      const onAbort = () => {
        clearTimeout(timer);
        reject(new AbortError("Sleep aborted"));
      };
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  /**
   * Creates a new session with the coordinator.
   * No SDP is sent — transport signaling is decoupled from session creation.
   *
   * The POST response is a slim acknowledgment (session_id, model name, status).
   * Capabilities and transport details are populated later once the Runtime
   * accepts the session — use {@link pollSessionReady} to wait for them.
   */
  async createSession(
    extraArgs?: Record<string, any>
  ): Promise<CreateSessionResponse> {
    console.debug("[CoordinatorClient] Creating session...");

    const requestBody: CreateSessionRequest = {
      model: { name: this.model },
      client_info: {
        sdk_version: REACTOR_SDK_VERSION,
        sdk_type: REACTOR_SDK_TYPE,
      },
      supported_transports: [
        { protocol: "webrtc", version: REACTOR_WEBRTC_VERSION },
      ],
      ...(extraArgs ? { extra_args: extraArgs } : {}),
    };

    const response = await fetch(`${this.baseUrl}/sessions`, {
      method: "POST",
      headers: {
        ...this.getHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: this.signal,
    });

    await this.checkVersionMismatch(response);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to create session: ${response.status} ${errorText}`
      );
    }

    const data = await response.json();
    const parsed = CreateSessionResponseSchema.parse(data);
    this.currentSessionId = parsed.session_id;

    console.debug(
      "[CoordinatorClient] Session created:",
      this.currentSessionId,
      "state:",
      parsed.state
    );

    return parsed;
  }

  /**
   * Polls GET /sessions/{id} until the Runtime has accepted the session
   * and populated capabilities and selected_transport.
   */
  async pollSessionReady(opts?: {
    maxAttempts?: number;
  }): Promise<SessionResponse> {
    if (!this.currentSessionId) {
      throw new Error("No active session. Call createSession() first.");
    }

    const maxAttempts = opts?.maxAttempts ?? SESSION_POLL_DEFAULT_MAX_ATTEMPTS;
    let backoffMs = SESSION_POLL_INITIAL_BACKOFF_MS;
    let attempt = 0;

    console.debug(
      "[CoordinatorClient] Polling session until capabilities are available..."
    );

    while (true) {
      if (this.signal.aborted) {
        throw new AbortError("Session polling aborted");
      }

      if (attempt >= maxAttempts) {
        throw new Error(
          `Session polling exceeded maximum attempts (${maxAttempts}). ` +
            `The model may be unavailable or overloaded.`
        );
      }

      attempt++;

      const response = await fetch(
        `${this.baseUrl}/sessions/${this.currentSessionId}`,
        {
          method: "GET",
          headers: this.getHeaders(),
          signal: this.signal,
        }
      );

      await this.checkVersionMismatch(response);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to poll session: ${response.status} ${errorText}`
        );
      }

      const data = await response.json();
      const partial = SessionResponseSchema.parse(data);

      const terminalStates: string[] = [
        SessionState.CLOSED,
        SessionState.INACTIVE,
      ];
      if (terminalStates.includes(partial.state)) {
        throw new Error(
          `Session entered terminal state "${partial.state}" while waiting for capabilities`
        );
      }

      if (partial.capabilities && partial.selected_transport) {
        console.debug(
          `[CoordinatorClient] Session ready after ${attempt} poll(s), ` +
            `transport: ${partial.selected_transport.protocol}, ` +
            `tracks: ${partial.capabilities.tracks.length}`
        );
        return partial;
      }

      console.debug(
        `[CoordinatorClient] Session poll ${attempt}/${maxAttempts} — ` +
          `state: ${partial.state}, waiting ${backoffMs}ms...`
      );

      await this.sleep(backoffMs);
      backoffMs = Math.min(
        backoffMs * SESSION_POLL_BACKOFF_MULTIPLIER,
        SESSION_POLL_MAX_BACKOFF_MS
      );
    }
  }

  /**
   * Gets session details from the coordinator.
   * Fields like selected_transport and capabilities are only present
   * after the Runtime accepts the session.
   */
  async getSession(): Promise<SessionResponse> {
    if (!this.currentSessionId) {
      throw new Error("No active session. Call createSession() first.");
    }

    const response = await fetch(
      `${this.baseUrl}/sessions/${this.currentSessionId}`,
      {
        method: "GET",
        headers: this.getHeaders(),
        signal: this.signal,
      }
    );

    await this.checkVersionMismatch(response);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get session: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return SessionResponseSchema.parse(data);
  }

  /**
   * Gets lightweight session status (session_id, cluster, status).
   */
  async getSessionInfo(): Promise<SessionInfoResponse> {
    if (!this.currentSessionId) {
      throw new Error("No active session. Call createSession() first.");
    }

    const response = await fetch(
      `${this.baseUrl}/sessions/${this.currentSessionId}/info`,
      {
        method: "GET",
        headers: this.getHeaders(),
        signal: this.signal,
      }
    );

    await this.checkVersionMismatch(response);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to get session info: ${response.status} ${errorText}`
      );
    }

    const data = await response.json();
    return SessionInfoResponseSchema.parse(data);
  }

  /**
   * Restarts an inactive session with a different compute unit.
   * The session ID is preserved but a new transport must be established.
   */
  async restartSession(): Promise<void> {
    if (!this.currentSessionId) {
      throw new Error("No active session. Call createSession() first.");
    }

    console.debug(
      "[CoordinatorClient] Restarting session:",
      this.currentSessionId
    );

    const response = await fetch(
      `${this.baseUrl}/sessions/${this.currentSessionId}`,
      {
        method: "PUT",
        headers: this.getHeaders(),
        signal: this.signal,
      }
    );

    await this.checkVersionMismatch(response);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to restart session: ${response.status} ${errorText}`
      );
    }
  }

  /**
   * Terminates the current session by sending a DELETE request.
   * No-op if no session has been created yet.
   * @param reason Optional termination reason
   */
  async terminateSession(reason?: string): Promise<void> {
    if (!this.currentSessionId) {
      return;
    }

    console.debug(
      "[CoordinatorClient] Terminating session:",
      this.currentSessionId
    );

    const body: TerminateSessionRequest | undefined = reason
      ? { reason }
      : undefined;

    const response = await fetch(
      `${this.baseUrl}/sessions/${this.currentSessionId}`,
      {
        method: "DELETE",
        headers: {
          ...this.getHeaders(),
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: this.signal,
      }
    );

    if (response.ok) {
      this.currentSessionId = undefined;
      return;
    }

    if (response.status === 404) {
      console.debug(
        "[CoordinatorClient] Session not found on server, clearing local state:",
        this.currentSessionId
      );
      this.currentSessionId = undefined;
      return;
    }

    const errorText = await response.text();
    throw new Error(
      `Failed to terminate session: ${response.status} ${errorText}`
    );
  }

  getSessionId(): string | undefined {
    return this.currentSessionId;
  }
}
