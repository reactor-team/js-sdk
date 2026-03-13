// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

import { describe, it, expect, afterEach } from "vitest";
import { CoordinatorClient } from "../../src/core/CoordinatorClient";
import { fetchInsecureToken } from "../../src/utils/tokens";
import { DEFAULT_BASE_URL } from "../../src/core/Reactor";

const API_KEY = process.env.REACTOR_API_KEY;
const COORDINATOR_URL = process.env.REACTOR_COORDINATOR_URL ?? DEFAULT_BASE_URL;
const MODEL = "echo";

describe.skipIf(!API_KEY)("CoordinatorClient — integration", () => {
  let client: CoordinatorClient;

  let cachedJwt: string | undefined;
  async function getJwt(): Promise<string> {
    if (!cachedJwt)
      cachedJwt = await fetchInsecureToken(API_KEY!, COORDINATOR_URL);
    return cachedJwt;
  }

  afterEach(async () => {
    try {
      await client?.terminateSession();
    } catch {
      /* may not exist */
    }
  });

  it("fetches ICE servers from production", async () => {
    const jwt = await getJwt();
    client = new CoordinatorClient({
      baseUrl: COORDINATOR_URL,
      jwtToken: jwt,
      model: MODEL,
    });

    const servers = await client.getIceServers();
    expect(Array.isArray(servers)).toBe(true);
    expect(servers.length).toBeGreaterThan(0);
    expect(servers[0]).toHaveProperty("urls");
  }, 15_000);

  it("creates a session and receives a UUID session ID", async () => {
    const jwt = await getJwt();
    client = new CoordinatorClient({
      baseUrl: COORDINATOR_URL,
      jwtToken: jwt,
      model: MODEL,
    });

    // Generate a real SDP offer so the coordinator accepts it
    const pc = new RTCPeerConnection({ iceServers: [] });
    pc.addTransceiver("video", { direction: "recvonly" });
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const sdp = pc.localDescription!.sdp;
    pc.close();

    const sessionId = await client.createSession(sdp);
    expect(typeof sessionId).toBe("string");
    expect(sessionId.length).toBeGreaterThan(0);
  }, 30_000);

  it("retrieves session info after creation", async () => {
    const jwt = await getJwt();
    client = new CoordinatorClient({
      baseUrl: COORDINATOR_URL,
      jwtToken: jwt,
      model: MODEL,
    });

    const pc = new RTCPeerConnection({ iceServers: [] });
    pc.addTransceiver("video", { direction: "recvonly" });
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const sdp = pc.localDescription!.sdp;
    pc.close();

    const sessionId = await client.createSession(sdp);
    const info = await client.getSession();
    expect(info.session_id).toBe(sessionId);
  }, 30_000);

  it("terminates a session cleanly", async () => {
    const jwt = await getJwt();
    client = new CoordinatorClient({
      baseUrl: COORDINATOR_URL,
      jwtToken: jwt,
      model: MODEL,
    });

    const pc = new RTCPeerConnection({ iceServers: [] });
    pc.addTransceiver("video", { direction: "recvonly" });
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const sdp = pc.localDescription!.sdp;
    pc.close();

    await client.createSession(sdp);
    await expect(client.terminateSession()).resolves.toBeUndefined();
  }, 30_000);
});
