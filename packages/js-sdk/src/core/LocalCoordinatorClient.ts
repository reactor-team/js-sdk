// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

/**
 * LocalCoordinatorClient connects to a local runtime instance.
 *
 * The local runtime uses a simpler protocol than the production coordinator:
 *   - POST /start_session  → starts session, returns full capabilities immediately
 *   - POST /stop_session   → stops session
 *   - Transport signaling via /sessions/{id}/transport/webrtc/* (unchanged)
 *
 * No session polling is needed because the local runtime IS the model host —
 * capabilities are known the moment the session is created.
 */

import { CoordinatorClient } from "./CoordinatorClient";
import {
  type CreateSessionResponse,
  type InitialSessionResponse,
  CreateSessionResponseSchema,
  InitialSessionResponseSchema,
  API_VERSION_HEADER,
  API_ACCEPT_VERSION_HEADER,
  REACTOR_API_VERSION,
} from "./types";

export class LocalCoordinatorClient extends CoordinatorClient {
  private cachedSessionResponse?: CreateSessionResponse;

  constructor(baseUrl: string, model: string) {
    super({
      baseUrl,
      jwtToken: "local",
      model,
    });
  }

  protected override getHeaders(): HeadersInit {
    return {
      [API_VERSION_HEADER]: String(REACTOR_API_VERSION),
      [API_ACCEPT_VERSION_HEADER]: String(REACTOR_API_VERSION),
    };
  }

  /**
   * Starts a session on the local runtime.
   *
   * Unlike the production coordinator, the local runtime returns the full
   * response (capabilities, selected_transport) immediately — no polling needed.
   */
  override async createSession(
    extraArgs?: Record<string, any>
  ): Promise<InitialSessionResponse> {
    console.debug("[LocalCoordinatorClient] Starting session...");

    const response = await fetch(`${this.baseUrl}/start_session`, {
      method: "POST",
      headers: {
        ...this.getHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...(extraArgs ? { extra_args: extraArgs } : {}),
      }),
      signal: this.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to start session: ${response.status} ${errorText}`
      );
    }

    const data = await response.json();

    this.cachedSessionResponse = CreateSessionResponseSchema.parse(data);
    this.currentSessionId = this.cachedSessionResponse.session_id;

    console.debug(
      "[LocalCoordinatorClient] Session started:",
      this.currentSessionId,
      "transport:",
      this.cachedSessionResponse.selected_transport.protocol,
      "tracks:",
      this.cachedSessionResponse.capabilities.tracks.length
    );

    return InitialSessionResponseSchema.parse(data);
  }

  /**
   * Returns the cached full session response immediately.
   * The local runtime already provided everything in start_session.
   */
  override async pollSessionReady(): Promise<CreateSessionResponse> {
    if (!this.cachedSessionResponse) {
      throw new Error(
        "No cached session response. Call createSession() first."
      );
    }
    return this.cachedSessionResponse;
  }

  /**
   * Stops the session on the local runtime.
   */
  override async terminateSession(): Promise<void> {
    if (!this.currentSessionId) {
      return;
    }

    console.debug(
      "[LocalCoordinatorClient] Stopping session:",
      this.currentSessionId
    );

    try {
      await fetch(`${this.baseUrl}/stop_session`, {
        method: "POST",
        headers: this.getHeaders(),
        signal: this.signal,
      });
    } catch (error) {
      console.error("[LocalCoordinatorClient] Error stopping session:", error);
    }

    this.currentSessionId = undefined;
    this.cachedSessionResponse = undefined;
  }
}
