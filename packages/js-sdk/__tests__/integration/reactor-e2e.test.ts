import { describe, it, expect, afterEach } from "vitest";
import { Reactor, DEFAULT_BASE_URL } from "../../src/core/Reactor";
import type { ReactorStatus, Capabilities } from "../../src/types";

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

function waitForStatus(
  reactor: Reactor,
  target: ReactorStatus,
  timeoutMs: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (reactor.getStatus() === target) {
      resolve();
      return;
    }
    const timeout = setTimeout(() => {
      reject(
        new Error(
          `Timed out waiting for "${target}", current: "${reactor.getStatus()}"`
        )
      );
    }, timeoutMs);

    const onStatus = (status: ReactorStatus) => {
      if (status === target) {
        clearTimeout(timeout);
        reactor.off("statusChanged", onStatus);
        resolve();
      }
    };
    reactor.on("statusChanged", onStatus);

    reactor.on("error", (err: any) => {
      clearTimeout(timeout);
      reactor.off("statusChanged", onStatus);
      reject(new Error(`Error while waiting: ${err.message ?? err.code}`));
    });
  });
}

describe.skipIf(!API_KEY)("Reactor E2E — echo model", () => {
  let reactor: Reactor;

  afterEach(async () => {
    try {
      await reactor?.disconnect();
    } catch {
      /* already disconnected */
    }
  });

  // ── Connection lifecycle ───────────────────────────────────────────────

  it("connects and reaches the ready state", async () => {
    const jwt = await fetchTestToken(API_KEY!, COORDINATOR_URL);
    reactor = new Reactor({
      modelName: MODEL,
      apiUrl: COORDINATOR_URL,
    });

    const statuses: ReactorStatus[] = [];
    reactor.on("statusChanged", (s: ReactorStatus) => statuses.push(s));

    await reactor.connect(jwt);
    await waitForStatus(reactor, "ready", 60_000);

    expect(reactor.getStatus()).toBe("ready");
    expect(statuses).toContain("connecting");
    expect(statuses).toContain("waiting");
    expect(reactor.getSessionId()).toBeDefined();
  }, 90_000);

  it("emits sessionIdChanged on connect", async () => {
    const jwt = await fetchTestToken(API_KEY!, COORDINATOR_URL);
    reactor = new Reactor({
      modelName: MODEL,
      apiUrl: COORDINATOR_URL,
    });

    let sessionId: string | undefined;
    reactor.on("sessionIdChanged", (id: string) => {
      sessionId = id;
    });

    await reactor.connect(jwt);
    await waitForStatus(reactor, "ready", 60_000);

    expect(typeof sessionId).toBe("string");
    expect(sessionId!.length).toBeGreaterThan(0);
  }, 90_000);

  it("receives capabilities after session creation", async () => {
    const jwt = await fetchTestToken(API_KEY!, COORDINATOR_URL);
    reactor = new Reactor({
      modelName: MODEL,
      apiUrl: COORDINATOR_URL,
    });

    let receivedCaps: Capabilities | undefined;
    reactor.on("capabilitiesReceived", (caps: Capabilities) => {
      receivedCaps = caps;
    });

    await reactor.connect(jwt);
    await waitForStatus(reactor, "ready", 60_000);

    expect(receivedCaps).toBeDefined();
    expect(receivedCaps!.tracks).toBeDefined();
    expect(receivedCaps!.tracks.length).toBeGreaterThan(0);
    expect(reactor.getCapabilities()).toBeDefined();
  }, 90_000);

  // ── Commands ───────────────────────────────────────────────────────────

  it("sends commands without error", async () => {
    const jwt = await fetchTestToken(API_KEY!, COORDINATOR_URL);
    reactor = new Reactor({
      modelName: MODEL,
      apiUrl: COORDINATOR_URL,
    });

    await reactor.connect(jwt);
    await waitForStatus(reactor, "ready", 60_000);

    await expect(
      reactor.sendCommand("set_effect", { effect: "grayscale" })
    ).resolves.toBeUndefined();

    await expect(
      reactor.sendCommand("set_intensity", { intensity: 0.5 })
    ).resolves.toBeUndefined();
  }, 90_000);

  // ── Disconnect ─────────────────────────────────────────────────────────

  it("disconnects cleanly after reaching ready", async () => {
    const jwt = await fetchTestToken(API_KEY!, COORDINATOR_URL);
    reactor = new Reactor({
      modelName: MODEL,
      apiUrl: COORDINATOR_URL,
    });

    await reactor.connect(jwt);
    await waitForStatus(reactor, "ready", 60_000);

    await reactor.disconnect();
    expect(reactor.getStatus()).toBe("disconnected");
    expect(reactor.getSessionId()).toBeUndefined();
  }, 90_000);

  // ── Full status lifecycle ──────────────────────────────────────────────

  it("status transitions: connecting → waiting → ready → disconnected", async () => {
    const jwt = await fetchTestToken(API_KEY!, COORDINATOR_URL);
    reactor = new Reactor({
      modelName: MODEL,
      apiUrl: COORDINATOR_URL,
    });

    const statuses: ReactorStatus[] = [];
    reactor.on("statusChanged", (s: ReactorStatus) => statuses.push(s));

    await reactor.connect(jwt);
    await waitForStatus(reactor, "ready", 60_000);
    await reactor.disconnect();

    expect(statuses[0]).toBe("connecting");
    expect(statuses).toContain("waiting");
    expect(statuses).toContain("ready");
    expect(statuses[statuses.length - 1]).toBe("disconnected");
  }, 90_000);

  // ── Stats ──────────────────────────────────────────────────────────────

  it("receives stats updates when connected", async () => {
    const jwt = await fetchTestToken(API_KEY!, COORDINATOR_URL);
    reactor = new Reactor({
      modelName: MODEL,
      apiUrl: COORDINATOR_URL,
    });

    await reactor.connect(jwt);
    await waitForStatus(reactor, "ready", 60_000);

    const stats = await new Promise<any>((resolve, reject) => {
      const existing = reactor.getStats();
      if (existing) {
        resolve(existing);
        return;
      }
      const timeout = setTimeout(
        () => reject(new Error("No stats received within 10 s")),
        10_000
      );
      reactor.on("statsUpdate", (s: any) => {
        clearTimeout(timeout);
        resolve(s);
      });
    });

    expect(stats).toBeDefined();
    expect(stats.timestamp).toBeGreaterThan(0);
  }, 90_000);

  // ── Error path ─────────────────────────────────────────────────────────

  it("rejects with an error for a non-existent model", async () => {
    const jwt = await fetchTestToken(API_KEY!, COORDINATOR_URL);
    const bad = new Reactor({
      modelName: "nonexistent-model-xyz-12345",
      apiUrl: COORDINATOR_URL,
    });

    await expect(bad.connect(jwt)).rejects.toThrow();
  }, 30_000);
});
