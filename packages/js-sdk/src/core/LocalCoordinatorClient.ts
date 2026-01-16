/**
 * LocalCoordinatorClient is a client for connecting to a local coordinator.
 * It extends CoordinatorClient and overrides methods for local development.
 */

import { CoordinatorClient } from "./CoordinatorClient";
import { IceServersResponse } from "./types";

export class LocalCoordinatorClient extends CoordinatorClient {
  private localBaseUrl: string;
  private sdpOffer: string | undefined;

  constructor(baseUrl: string) {
    // Pass dummy values to parent - they won't be used for local
    super({
      baseUrl: baseUrl,
      jwtToken: "local",
      model: "local",
    });
    this.localBaseUrl = baseUrl;
  }

  /**
   * Gets ICE servers from the local HTTP runtime.
   * @returns The ICE server configuration
   */
  async getIceServers(): Promise<RTCIceServer[]> {
    console.debug("[LocalCoordinatorClient] Fetching ICE servers...");
    const response = await fetch(`${this.localBaseUrl}/ice_servers`, {
      method: "GET",
    });

    if (!response.ok) {
      throw new Error("Failed to get ICE servers from local coordinator.");
    }

    const data: IceServersResponse = await response.json();
    console.debug(
      "[LocalCoordinatorClient] Received ICE servers:",
      data.ice_servers
    );
    return data.ice_servers;
  }

  /**
   * Creates a local session by posting to /start_session.
   * @returns always "local"
   */
  async createSession(sdpOffer: string): Promise<string> {
    console.debug("[LocalCoordinatorClient] Creating local session...");
    this.sdpOffer = sdpOffer;
    const response = await fetch(`${this.localBaseUrl}/start_session`, {
      method: "POST",
    });

    if (!response.ok) {
      throw new Error("Failed to send local start session command.");
    }

    console.debug("[LocalCoordinatorClient] Local session created");
    return "local";
  }

  /**
   * Connects to the local session by posting SDP params to /sdp_params.
   * @param sessionId - The session ID (ignored for local)
   * @param sdpMessage - The SDP offer from the local WebRTC peer connection
   * @returns The SDP answer from the server
   */
  async connect(sessionId: string, sdpMessage: string): Promise<string> {
    this.sdpOffer = sdpMessage || this.sdpOffer;
    console.debug("[LocalCoordinatorClient] Connecting to local session...");
    const sdpBody = {
      sdp: this.sdpOffer,
      type: "offer",
    };
    const response = await fetch(`${this.localBaseUrl}/sdp_params`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(sdpBody),
    });

    if (!response.ok) {
      throw new Error("Failed to get SDP answer from local coordinator.");
    }

    const sdpAnswer: { sdp: string; type: "answer" } = await response.json();
    console.debug("[LocalCoordinatorClient] Received SDP answer");
    return sdpAnswer.sdp;
  }

  async terminateSession(): Promise<void> {
    console.debug("[LocalCoordinatorClient] Stopping local session...");
    await fetch(`${this.localBaseUrl}/stop_session`, {
      method: "POST",
    });
  }
}
