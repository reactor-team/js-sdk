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
  type SessionResponse,
  CreateSessionResponseSchema,
  SessionResponseSchema,
  API_VERSION_HEADER,
  API_ACCEPT_VERSION_HEADER,
  REACTOR_API_VERSION,
} from "./types";

export class LocalCoordinatorClient extends CoordinatorClient {
  private cachedSessionResponse?: SessionResponse;

  constructor(baseUrl: string, model: string) {
    super({
      baseUrl,
      jwtToken: "local",
      model,
    });
  }

  // Local runtime endpoints are auth-free; skip the Authorization header.
  protected override async getHeaders(): Promise<Record<string, string>> {
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
  ): Promise<CreateSessionResponse> {
    console.debug("[LocalCoordinatorClient] Starting session...");

    const response = await fetch(`${this.baseUrl}/start_session`, {
      method: "POST",
      headers: {
        ...(await this.getHeaders()),
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

    const session = SessionResponseSchema.parse(data);
    this.cachedSessionResponse = session;
    this.currentSessionId = session.session_id;

    console.debug(
      "[LocalCoordinatorClient] Session started:",
      this.currentSessionId,
      "transport:",
      session.selected_transport?.protocol,
      "tracks:",
      session.capabilities?.tracks.length
    );

    return CreateSessionResponseSchema.parse(data);
  }

  /**
   * Not supported in local mode. The local runtime only surfaces capabilities
   * through `start_session`, so there is no way to attach to a session this
   * client did not start. Use a fresh `connect()` (which starts a session)
   * instead of passing `connect({ sessionId })`.
   */
  override async adoptSession(_sessionId: string): Promise<void> {
    throw new Error(
      "Attaching to an existing session id is not supported in local mode."
    );
  }

  /**
   * Returns the cached full session response immediately.
   * The local runtime already provided everything in start_session.
   */
  override async pollSessionReady(): Promise<SessionResponse> {
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
        headers: await this.getHeaders(),
        signal: this.signal,
      });
    } catch (error) {
      console.error("[LocalCoordinatorClient] Error stopping session:", error);
    }

    this.currentSessionId = undefined;
    this.cachedSessionResponse = undefined;
  }
}
