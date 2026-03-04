/**
 * The CoordinatorClient is responsible for handling the connection to the coordinator
 * via HTTP requests and WebRTC signaling.
 */

import {
  CreateSessionRequest,
  CreateSessionResponse,
  IceServersResponseSchema,
  SDPParamsRequest,
  SDPParamsResponse,
  SessionInfoResponse,
} from "./types";
import { AbortError } from "../types";
import { transformIceServers } from "../utils/webrtc";

export interface CoordinatorClientOptions {
  baseUrl: string;
  jwtToken: string;
  model: string;
}

// Polling configuration
const INITIAL_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 15000;
const BACKOFF_MULTIPLIER = 2;
const DEFAULT_MAX_ATTEMPTS = 6;

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
   * Aborts any in-flight HTTP requests and polling loops.
   * A fresh AbortController is created so the client remains reusable.
   */
  abort(): void {
    this.abortController.abort();
    this.abortController = new AbortController();
  }

  /**
   * The current abort signal, passed to every fetch() and sleep() call.
   * Protected so subclasses can forward it to their own fetch calls.
   */
  protected get signal(): AbortSignal {
    return this.abortController.signal;
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
   * Fetches ICE servers from the coordinator.
   * @returns Array of RTCIceServer objects for WebRTC peer connection configuration
   */
  async getIceServers(): Promise<RTCIceServer[]> {
    console.debug("[CoordinatorClient] Fetching ICE servers...");

    const response = await fetch(
      `${this.baseUrl}/ice_servers?model=${this.model}`,
      {
        method: "GET",
        headers: this.getAuthHeaders(),
        signal: this.signal,
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch ICE servers: ${response.status}`);
    }

    const data = await response.json();
    const parsed = IceServersResponseSchema.parse(data);
    const iceServers = transformIceServers(parsed);

    console.debug(
      "[CoordinatorClient] Received ICE servers:",
      iceServers.length
    );
    return iceServers;
  }

  /**
   * Creates a new session with the coordinator.
   * Expects a 200 response and stores the session ID.
   * @returns The session ID
   */
  async createSession(sdp_offer: string): Promise<string> {
    console.debug("[CoordinatorClient] Creating session...");

    const requestBody: CreateSessionRequest = {
      model: { name: this.model },
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
      signal: this.signal,
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
        signal: this.signal,
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
   * No-op if no session has been created yet.
   * @throws Error if the request fails (except for 404, which clears local state)
   */
  async terminateSession(): Promise<void> {
    if (!this.currentSessionId) {
      return;
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
        signal: this.signal,
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
        signal: this.signal,
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
   * Polls for the SDP answer with exponential backoff.
   * Used for async reconnection when the answer is not immediately available.
   * @param sessionId - The session ID to poll for
   * @param maxAttempts - Optional maximum number of polling attempts before giving up
   * @returns The SDP answer from the server
   */
  private async pollSdpAnswer(
    sessionId: string,
    maxAttempts: number = DEFAULT_MAX_ATTEMPTS
  ): Promise<string> {
    console.debug(
      "[CoordinatorClient] Polling for SDP answer for session:",
      sessionId
    );

    let backoffMs = INITIAL_BACKOFF_MS;
    let attempt = 0;

    while (true) {
      if (this.signal.aborted) {
        throw new AbortError("SDP polling aborted");
      }

      if (attempt >= maxAttempts) {
        throw new Error(
          `SDP polling exceeded maximum attempts (${maxAttempts}) for session ${sessionId}`
        );
      }

      attempt++;
      console.debug(
        `[CoordinatorClient] SDP poll attempt ${attempt}/${maxAttempts} for session ${sessionId}`
      );

      const response = await fetch(
        `${this.baseUrl}/sessions/${sessionId}/sdp_params`,
        {
          method: "GET",
          headers: {
            ...this.getAuthHeaders(),
            "Content-Type": "application/json",
          },
          signal: this.signal,
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

        // Exponential backoff capped at MAX_BACKOFF_MS (15s)
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
   * @param maxAttempts - Optional maximum number of polling attempts before giving up
   * @returns The SDP answer from the server
   */
  async connect(
    sessionId: string,
    sdpOffer?: string,
    maxAttempts?: number
  ): Promise<string> {
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
    return this.pollSdpAnswer(sessionId, maxAttempts);
  }

  /**
   * Abort-aware sleep. Resolves after `ms` milliseconds unless the
   * abort signal fires first, in which case it rejects with AbortError.
   */
  private sleep(ms: number): Promise<void> {
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
}
