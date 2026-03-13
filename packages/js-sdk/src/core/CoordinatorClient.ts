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
  type SessionInfoResponse,
  type TerminateSessionRequest,
  CreateSessionResponseSchema,
  SessionInfoResponseSchema,
  REACTOR_API_VERSION,
  REACTOR_SDK_VERSION,
  REACTOR_SDK_TYPE,
  REACTOR_WEBRTC_VERSION,
  API_VERSION_HEADER,
  API_ACCEPT_VERSION_HEADER,
  VERSION_ERROR_CODES,
} from "./types";
import { AbortError } from "../types";

export interface CoordinatorClientOptions {
  baseUrl: string;
  jwtToken: string;
  model: string;
}

export class CoordinatorClient {
  private baseUrl: string;
  private jwtToken: string;
  private model: string;
  private currentSessionId?: string;
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

  /**
   * Creates a new session with the coordinator.
   * No SDP is sent — transport signaling is decoupled from session creation.
   * @returns The full session creation response (session_id, selected_transport, capabilities, etc.)
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
      "transport:",
      parsed.selected_transport.protocol
    );

    return parsed;
  }

  /**
   * Gets full session details from the coordinator.
   * Returns the same shape as the creation response but with updated state.
   */
  async getSession(): Promise<CreateSessionResponse> {
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
    return CreateSessionResponseSchema.parse(data);
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
