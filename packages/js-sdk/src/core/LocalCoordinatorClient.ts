/**
 * LocalCoordinatorClient connects to a local runtime instance.
 *
 * The local runtime uses a simpler protocol than the production coordinator:
 *   - POST /start_session  → starts session, returns full capabilities immediately
 *   - GET  /session        → read-only session descriptor (no id; single session)
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
   * Adopts the local session for `connect({ sessionId })`: records the id and
   * reads the session descriptor, caching it so {@link pollSessionReady}
   * returns immediately. No `start_session` is issued.
   *
   * The local runtime hosts a single session (always id `"local"`), so the
   * lookup ignores the specific id. This is a pure read of session info — it
   * does not start or otherwise advance the session.
   */
  override async adoptSession(sessionId: string): Promise<void> {
    this.currentSessionId = sessionId;
    this.cachedSessionResponse = await this.getSession();
    console.debug(
      "[LocalCoordinatorClient] Adopted existing session:",
      sessionId
    );
  }

  /**
   * Reads the local session descriptor (model, capabilities, transport,
   * state) via the runtime's read-only `GET /session`.
   *
   * The local runtime exposes a single session, so — unlike the Coordinator's
   * id-addressed `GET /sessions/{id}` — there is no id in the path. Read-only:
   * it does not start or advance the session.
   */
  override async getSession(): Promise<SessionResponse> {
    const response = await fetch(`${this.baseUrl}/session`, {
      method: "GET",
      headers: await this.getHeaders(),
      signal: this.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get session: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return SessionResponseSchema.parse(data);
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
