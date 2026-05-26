import { describe, it, expect, afterEach } from "vitest";
import { CoordinatorClient } from "../../src/core/CoordinatorClient";
import { DEFAULT_BASE_URL } from "../../src/core/Reactor";

const API_KEY = process.env.REACTOR_API_KEY;
const COORDINATOR_URL = process.env.REACTOR_COORDINATOR_URL ?? DEFAULT_BASE_URL;

async function fetchTestToken(apiKey: string, apiUrl: string): Promise<string> {
  const response = await fetch(`${apiUrl}/tokens`, {
    method: "POST",
    headers: { "Reactor-API-Key": apiKey },
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create token: ${response.status} ${error}`);
  }
  const { jwt } = await response.json();
  return jwt;
}
const MODEL = "echo";

describe.skipIf(!API_KEY)("CoordinatorClient — integration", () => {
  let client: CoordinatorClient;

  let cachedJwt: string | undefined;
  async function getJwt(): Promise<string> {
    if (!cachedJwt) cachedJwt = await fetchTestToken(API_KEY!, COORDINATOR_URL);
    return cachedJwt;
  }

  afterEach(async () => {
    try {
      await client?.terminateSession();
    } catch {
      /* may not exist */
    }
  });

  it("creates a session and receives a session ID", async () => {
    const jwt = await getJwt();
    client = new CoordinatorClient({
      baseUrl: COORDINATOR_URL,
      jwtToken: jwt,
      model: MODEL,
    });

    const response = await client.createSession();
    expect(typeof response.session_id).toBe("string");
    expect(response.session_id.length).toBeGreaterThan(0);
    expect(response.model.name).toBe(MODEL);
    expect(response.state).toBeDefined();
  }, 30_000);

  it("polls until session is ready with capabilities", async () => {
    const jwt = await getJwt();
    client = new CoordinatorClient({
      baseUrl: COORDINATOR_URL,
      jwtToken: jwt,
      model: MODEL,
    });

    await client.createSession();
    const fullResponse = await client.pollSessionReady({ maxAttempts: 30 });

    expect(fullResponse.capabilities).toBeDefined();
    expect(fullResponse.capabilities.tracks).toBeDefined();
    expect(fullResponse.selected_transport).toBeDefined();
    expect(fullResponse.selected_transport.protocol).toBe("webrtc");
  }, 60_000);

  it("retrieves session info after creation", async () => {
    const jwt = await getJwt();
    client = new CoordinatorClient({
      baseUrl: COORDINATOR_URL,
      jwtToken: jwt,
      model: MODEL,
    });

    const initial = await client.createSession();
    const info = await client.getSession();
    expect(info.session_id).toBe(initial.session_id);
  }, 30_000);

  it("terminates a session cleanly", async () => {
    const jwt = await getJwt();
    client = new CoordinatorClient({
      baseUrl: COORDINATOR_URL,
      jwtToken: jwt,
      model: MODEL,
    });

    await client.createSession();
    await expect(client.terminateSession()).resolves.toBeUndefined();
  }, 30_000);
});
