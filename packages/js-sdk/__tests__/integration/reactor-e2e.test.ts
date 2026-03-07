// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

import { describe, it, expect, afterEach } from "vitest";
import { Reactor, PROD_COORDINATOR_URL } from "../../src/core/Reactor";
import { video } from "../../src/types";
import { fetchInsecureJwtToken } from "../../src/utils/tokens";
import type { ReactorStatus } from "../../src/types";

const API_KEY = process.env.REACTOR_API_KEY;
const COORDINATOR_URL =
  process.env.REACTOR_COORDINATOR_URL ?? PROD_COORDINATOR_URL;
const MODEL = "echo";

function waitForStatus(
  reactor: Reactor,
  target: ReactorStatus,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (reactor.getStatus() === target) {
      resolve();
      return;
    }
    const timeout = setTimeout(() => {
      reject(
        new Error(
          `Timed out waiting for "${target}", current: "${reactor.getStatus()}"`,
        ),
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
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
    const jwt = await fetchInsecureJwtToken(API_KEY!, COORDINATOR_URL);
    reactor = new Reactor({
      modelName: MODEL,
      coordinatorUrl: COORDINATOR_URL,
      receive: [video("main_video")],
    });

    const statuses: ReactorStatus[] = [];
    reactor.on("statusChanged", (s: ReactorStatus) => statuses.push(s));

    await reactor.connect(jwt);
    await waitForStatus(reactor, "ready", 60_000);

    expect(reactor.getStatus()).toBe("ready");
    expect(statuses).toContain("connecting");
    expect(reactor.getSessionId()).toBeDefined();
  }, 90_000);

  it("emits sessionIdChanged on connect", async () => {
    const jwt = await fetchInsecureJwtToken(API_KEY!, COORDINATOR_URL);
    reactor = new Reactor({
      modelName: MODEL,
      coordinatorUrl: COORDINATOR_URL,
      receive: [video("main_video")],
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

  // ── Commands ───────────────────────────────────────────────────────────

  it("sends commands (set_effect, set_intensity) without error", async () => {
    const jwt = await fetchInsecureJwtToken(API_KEY!, COORDINATOR_URL);
    reactor = new Reactor({
      modelName: MODEL,
      coordinatorUrl: COORDINATOR_URL,
      receive: [video("main_video")],
    });

    await reactor.connect(jwt);
    await waitForStatus(reactor, "ready", 60_000);

    await expect(
      reactor.sendCommand("set_effect", { effect: "grayscale" }),
    ).resolves.toBeUndefined();

    await expect(
      reactor.sendCommand("set_intensity", { intensity: 0.5 }),
    ).resolves.toBeUndefined();
  }, 90_000);

  // ── Disconnect ─────────────────────────────────────────────────────────

  it("disconnects cleanly after reaching ready", async () => {
    const jwt = await fetchInsecureJwtToken(API_KEY!, COORDINATOR_URL);
    reactor = new Reactor({
      modelName: MODEL,
      coordinatorUrl: COORDINATOR_URL,
      receive: [video("main_video")],
    });

    await reactor.connect(jwt);
    await waitForStatus(reactor, "ready", 60_000);

    await reactor.disconnect();
    expect(reactor.getStatus()).toBe("disconnected");
    expect(reactor.getSessionId()).toBeUndefined();
  }, 90_000);

  // ── Full status lifecycle ──────────────────────────────────────────────

  it("status transitions: connecting → ready → disconnected", async () => {
    const jwt = await fetchInsecureJwtToken(API_KEY!, COORDINATOR_URL);
    reactor = new Reactor({
      modelName: MODEL,
      coordinatorUrl: COORDINATOR_URL,
      receive: [video("main_video")],
    });

    const statuses: ReactorStatus[] = [];
    reactor.on("statusChanged", (s: ReactorStatus) => statuses.push(s));

    await reactor.connect(jwt);
    await waitForStatus(reactor, "ready", 60_000);
    await reactor.disconnect();

    expect(statuses[0]).toBe("connecting");
    expect(statuses).toContain("ready");
    expect(statuses[statuses.length - 1]).toBe("disconnected");
  }, 90_000);

  // ── Stats ──────────────────────────────────────────────────────────────

  it("receives stats updates when connected", async () => {
    const jwt = await fetchInsecureJwtToken(API_KEY!, COORDINATOR_URL);
    reactor = new Reactor({
      modelName: MODEL,
      coordinatorUrl: COORDINATOR_URL,
      receive: [video("main_video")],
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
        10_000,
      );
      reactor.on("statsUpdate", (s: any) => {
        clearTimeout(timeout);
        resolve(s);
      });
    });

    expect(stats).toBeDefined();
    expect(stats.timestamp).toBeGreaterThan(0);
  }, 90_000);

  // ── Multiple receive tracks ────────────────────────────────────────────

  it("negotiates multiple receive tracks", async () => {
    const jwt = await fetchInsecureJwtToken(API_KEY!, COORDINATOR_URL);
    reactor = new Reactor({
      modelName: MODEL,
      coordinatorUrl: COORDINATOR_URL,
      receive: [video("main_video"), video("video_edges"), video("video_sepia")],
    });

    await reactor.connect(jwt);
    await waitForStatus(reactor, "ready", 60_000);
    expect(reactor.getStatus()).toBe("ready");
  }, 90_000);

  // ── Send + receive tracks ──────────────────────────────────────────────

  it("connects with both send and receive tracks", async () => {
    const jwt = await fetchInsecureJwtToken(API_KEY!, COORDINATOR_URL);
    reactor = new Reactor({
      modelName: MODEL,
      coordinatorUrl: COORDINATOR_URL,
      receive: [video("main_video")],
      send: [video("webcam")],
    });

    await reactor.connect(jwt);
    await waitForStatus(reactor, "ready", 60_000);

    expect(reactor.getStatus()).toBe("ready");
    expect(reactor.getSessionId()).toBeDefined();
  }, 90_000);

  // ── Error path ─────────────────────────────────────────────────────────

  it("rejects with an error for a non-existent model", async () => {
    const jwt = await fetchInsecureJwtToken(API_KEY!, COORDINATOR_URL);
    const bad = new Reactor({
      modelName: "nonexistent-model-xyz-12345",
      coordinatorUrl: COORDINATOR_URL,
      receive: [video("main_video")],
    });

    await expect(bad.connect(jwt)).rejects.toThrow();
  }, 30_000);
});
