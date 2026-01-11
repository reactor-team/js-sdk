/**
 * The CoordinatorClient is responsible for handling the connection to the coordinator
 * via HTTP requests and WebRTC signaling.
 */

import {
  CreateSessionRequest,
  CreateSessionResponse,
  SDPParamsRequest,
  SDPParamsResponse,
  SessionInfoResponse,
} from "./types";

export interface CoordinatorClientOptions {
  baseUrl: string;
  jwtToken: string;
  model: string;
}

// Polling configuration
const INITIAL_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 30000;
const BACKOFF_MULTIPLIER = 2;

export class CoordinatorClient {
  private baseUrl: string;
  private jwtToken: string;
  private model: string;
  private currentSessionId?: string;

  constructor(options: CoordinatorClientOptions) {
    this.baseUrl = options.baseUrl;
    this.jwtToken = options.jwtToken;
    this.model = options.model;
  }

  /**
   * Returns the authorization header with JWT Bearer token
   */
  private getAuthHeaders(): HeadersInit {
    return {
      Authorization: `Bearer ${this.jwtToken}`,
    };
  }

  /**
   * Creates a new session with the coordinator.
   * Expects a 200 response and stores the session ID.
   * @returns The session ID
   */
  async createSession(sdp_offer: string): Promise<string> {
    console.debug("[CoordinatorClient] Creating session...");

    const requestBody: CreateSessionRequest = {
      model: this.model,
      sdp_offer: sdp_offer,
      extra_args: {},
    };

    const response = await fetch(`${this.baseUrl}/sessions`, {
      method: "POST",
      headers: {
        ...this.getAuthHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to create session: ${response.status} ${errorText}`
      );
    }

    const data: CreateSessionResponse = await response.json();
    this.currentSessionId = data.session_id;

    console.debug(
      "[CoordinatorClient] Session created with ID:",
      this.currentSessionId
    );

    return data.session_id;
  }

  /**
   * Gets the current session information from the coordinator.
   * @returns The session data (untyped for now)
   */
  async getSession(): Promise<SessionInfoResponse> {
    if (!this.currentSessionId) {
      throw new Error("No active session. Call createSession() first.");
    }

    console.debug(
      "[CoordinatorClient] Getting session info for:",
      this.currentSessionId
    );

    const response = await fetch(
      `${this.baseUrl}/sessions/${this.currentSessionId}`,
      {
        method: "GET",
        headers: this.getAuthHeaders(),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get session: ${response.status} ${errorText}`);
    }

    const data: SessionInfoResponse = await response.json();

    return data;
  }

  /**
   * Terminates the current session by sending a DELETE request to the coordinator.
   * @throws Error if no active session exists or if the request fails (except for 404)
   */
  async terminateSession(): Promise<void> {
    if (!this.currentSessionId) {
      throw new Error("No active session. Call createSession() first.");
    }

    console.debug(
      "[CoordinatorClient] Terminating session:",
      this.currentSessionId
    );

    const response = await fetch(
      `${this.baseUrl}/sessions/${this.currentSessionId}`,
      {
        method: "DELETE",
        headers: this.getAuthHeaders(),
      }
    );

    if (response.ok) {
      this.currentSessionId = undefined;
      return;
    }

    if (response.status === 404) {
      // Session doesn't exist on server, clear local state to stay consistent
      console.debug(
        "[CoordinatorClient] Session not found on server, clearing local state:",
        this.currentSessionId
      );
      this.currentSessionId = undefined;
      return;
    }

    // For other error codes, throw without clearing state (might warrant retry)
    const errorText = await response.text();
    throw new Error(
      `Failed to terminate session: ${response.status} ${errorText}`
    );
  }

  /**
   * Get the current session ID
   */
  getSessionId(): string | undefined {
    return this.currentSessionId;
  }

  /**
   * Sends an SDP offer to the server for reconnection.
   * @param sessionId - The session ID to connect to
   * @param sdpOffer - The SDP offer from the local WebRTC peer connection
   * @returns The SDP answer if ready (200), or null if pending (202)
   */
  private async sendSdpOffer(
    sessionId: string,
    sdpOffer: string
  ): Promise<string | null> {
    console.debug(
      "[CoordinatorClient] Sending SDP offer for session:",
      sessionId
    );

    const requestBody: SDPParamsRequest = {
      sdp_offer: sdpOffer,
      extra_args: {},
    };

    const response = await fetch(
      `${this.baseUrl}/sessions/${sessionId}/sdp_params`,
      {
        method: "PUT",
        headers: {
          ...this.getAuthHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (response.status === 200) {
      const answerData: SDPParamsResponse = await response.json();
      console.debug("[CoordinatorClient] Received SDP answer immediately");
      return answerData.sdp_answer;
    }

    if (response.status === 202) {
      console.debug(
        "[CoordinatorClient] SDP offer accepted, answer pending (202)"
      );
      return null;
    }

    const errorText = await response.text();
    throw new Error(
      `Failed to send SDP offer: ${response.status} ${errorText}`
    );
  }

  /**
   * Polls for the SDP answer with geometric backoff.
   * Used for async reconnection when the answer is not immediately available.
   * @param sessionId - The session ID to poll for
   * @returns The SDP answer from the server
   */
  private async pollSdpAnswer(sessionId: string): Promise<string> {
    console.debug(
      "[CoordinatorClient] Polling for SDP answer for session:",
      sessionId
    );

    let backoffMs = INITIAL_BACKOFF_MS;
    let attempt = 0;

    while (true) {
      attempt++;
      console.debug(
        `[CoordinatorClient] SDP poll attempt ${attempt} for session ${sessionId}`
      );

      const response = await fetch(
        `${this.baseUrl}/sessions/${sessionId}/sdp_params`,
        {
          method: "GET",
          headers: {
            ...this.getAuthHeaders(),
            "Content-Type": "application/json",
          },
        }
      );

      if (response.status === 200) {
        const answerData: SDPParamsResponse = await response.json();
        console.debug("[CoordinatorClient] Received SDP answer via polling");
        return answerData.sdp_answer;
      }

      if (response.status === 202) {
        console.warn(
          `[CoordinatorClient] SDP answer pending (202), retrying in ${backoffMs}ms...`
        );

        await this.sleep(backoffMs);

        // Geometric backoff
        backoffMs = Math.min(backoffMs * BACKOFF_MULTIPLIER, MAX_BACKOFF_MS);
        continue;
      }

      // For other error codes, throw immediately
      const errorText = await response.text();
      throw new Error(
        `Failed to poll SDP answer: ${response.status} ${errorText}`
      );
    }
  }

  /**
   * Connects to the session by sending an SDP offer and receiving an SDP answer.
   * If sdpOffer is provided, sends it first. If the answer is pending (202),
   * falls back to polling. If no sdpOffer is provided, goes directly to polling.
   * @param sessionId - The session ID to connect to
   * @param sdpOffer - Optional SDP offer from the local WebRTC peer connection
   * @returns The SDP answer from the server
   */
  async connect(sessionId: string, sdpOffer?: string): Promise<string> {
    console.debug("[CoordinatorClient] Connecting to session:", sessionId);

    if (sdpOffer) {
      // Reconnection: we have a new SDP offer (recalculated after ICE restart)
      // Try to send it and get an immediate answer
      const answer = await this.sendSdpOffer(sessionId, sdpOffer);
      if (answer !== null) {
        return answer;
      }
      // Server accepted but answer not ready yet (202), fall back to polling
    }

    // No SDP offer = async reconnection, poll until server has the answer
    return this.pollSdpAnswer(sessionId);
  }

  /**
   * Utility function to sleep for a given number of milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
