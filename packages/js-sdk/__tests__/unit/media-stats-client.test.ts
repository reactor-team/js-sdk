/**
 * Tests for {@link MediaStatsClient} in isolation, against a fake
 * {@link MediaStatsClientHost}. Reactor-level integration is in
 * `reactor-media-stats.test.ts`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MediaStatsClient,
  type MediaStatsClientHost,
} from "../../src/core/MediaStatsClient";
import type { ReactorStatus, RuntimeAlert } from "../../src/types";
import {
  DEFAULT_ALERT_BACKOFF_MS,
  DEFAULT_DEGRADED_NETWORK_MESSAGE,
  DEFAULT_MIN_AGGREGATE_QOS,
  DEFAULT_SUSTAINED_DEGRADATION_MS,
  RuntimeMediaStatsMessageType,
} from "../../src/utils/mediaStats";

interface FakeHostHandles {
  host: MediaStatsClientHost;
  emitRuntimeMessage: (msg: unknown) => void;
  emitStatus: (status: ReactorStatus) => void;
  getAlerts: () => Array<{ type: string; data: RuntimeAlert }>;
  isRuntimeMessageUnsubscribed: () => boolean;
}

function buildMediaStats(aggregateQos: number): {
  type: string;
  data: { video: { aggregateQos: number } };
} {
  return {
    type: RuntimeMediaStatsMessageType.MEDIA_STATS,
    data: { video: { aggregateQos } },
  };
}

function makeHost(): FakeHostHandles {
  const runtimeListeners = new Set<(msg: unknown) => void>();
  const statusListeners = new Set<(s: ReactorStatus) => void>();
  let runtimeMessageUnsubCalled = false;
  const alerts: Array<{ type: string; data: RuntimeAlert }> = [];

  const host: MediaStatsClientHost = {
    onRuntimeMessage(handler) {
      runtimeListeners.add(handler);
      return () => {
        runtimeListeners.delete(handler);
        runtimeMessageUnsubCalled = true;
      };
    },
    onStatusChanged(handler) {
      statusListeners.add(handler);
      return () => statusListeners.delete(handler);
    },
    emitRuntimeMessage(message) {
      alerts.push(message);
    },
  };

  return {
    host,
    emitRuntimeMessage: (msg) =>
      runtimeListeners.forEach((handler) => handler(msg)),
    emitStatus: (s) => statusListeners.forEach((handler) => handler(s)),
    getAlerts: () => alerts,
    isRuntimeMessageUnsubscribed: () => runtimeMessageUnsubCalled,
  };
}

describe("MediaStatsClient", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("ignores non-mediaStats messages on the private channel", () => {
    const fake = makeHost();
    const client = new MediaStatsClient(fake.host);
    fake.emitRuntimeMessage({ type: "ping", data: {} });
    fake.emitRuntimeMessage({
      type: RuntimeMediaStatsMessageType.ALERT,
      data: {},
    });
    vi.advanceTimersByTime(DEFAULT_SUSTAINED_DEGRADATION_MS + 1);
    expect(fake.getAlerts()).toHaveLength(0);
    client.destroy();
  });

  it("ignores malformed mediaStats payloads", () => {
    const fake = makeHost();
    const client = new MediaStatsClient(fake.host);
    fake.emitRuntimeMessage({
      type: RuntimeMediaStatsMessageType.MEDIA_STATS,
      data: { video: {} },
    });
    vi.advanceTimersByTime(DEFAULT_SUSTAINED_DEGRADATION_MS + 1);
    expect(fake.getAlerts()).toHaveLength(0);
    client.destroy();
  });

  it("does not alert when QoS is at or above threshold", () => {
    const fake = makeHost();
    const client = new MediaStatsClient(fake.host);
    fake.emitRuntimeMessage(buildMediaStats(DEFAULT_MIN_AGGREGATE_QOS));
    fake.emitRuntimeMessage(buildMediaStats(DEFAULT_MIN_AGGREGATE_QOS + 1));
    vi.advanceTimersByTime(DEFAULT_SUSTAINED_DEGRADATION_MS + 1);
    expect(fake.getAlerts()).toHaveLength(0);
    client.destroy();
  });

  it("alerts after sustained low QoS", () => {
    const fake = makeHost();
    const client = new MediaStatsClient(fake.host);
    fake.emitRuntimeMessage(buildMediaStats(1));
    vi.advanceTimersByTime(DEFAULT_SUSTAINED_DEGRADATION_MS);
    expect(fake.getAlerts()).toHaveLength(1);
    expect(fake.getAlerts()[0]).toEqual({
      type: RuntimeMediaStatsMessageType.ALERT,
      data: {
        level: "warn",
        message: DEFAULT_DEGRADED_NETWORK_MESSAGE,
      },
    });
    client.destroy();
  });

  it("resets degradation timer when QoS recovers before sustained duration", () => {
    const fake = makeHost();
    const client = new MediaStatsClient(fake.host);
    fake.emitRuntimeMessage(buildMediaStats(1));
    vi.advanceTimersByTime(DEFAULT_SUSTAINED_DEGRADATION_MS - 1_000);
    fake.emitRuntimeMessage(buildMediaStats(DEFAULT_MIN_AGGREGATE_QOS));
    vi.advanceTimersByTime(DEFAULT_SUSTAINED_DEGRADATION_MS);
    expect(fake.getAlerts()).toHaveLength(0);
    client.destroy();
  });

  it("suppresses alert during backoff and re-arms degradation timer", () => {
    const fake = makeHost();
    const client = new MediaStatsClient(fake.host);
    fake.emitRuntimeMessage(buildMediaStats(1));
    vi.advanceTimersByTime(DEFAULT_SUSTAINED_DEGRADATION_MS);
    expect(fake.getAlerts()).toHaveLength(1);

    // Re-armed degradation timer fires while still in backoff — no second alert.
    vi.advanceTimersByTime(DEFAULT_SUSTAINED_DEGRADATION_MS);
    expect(fake.getAlerts()).toHaveLength(1);
    client.destroy();
  });

  it("emits a second alert after backoff and another sustained degradation", () => {
    const fake = makeHost();
    const client = new MediaStatsClient(fake.host);
    fake.emitRuntimeMessage(buildMediaStats(1));
    vi.advanceTimersByTime(DEFAULT_SUSTAINED_DEGRADATION_MS);
    expect(fake.getAlerts()).toHaveLength(1);

    // Backoff expires, degradation re-arms, second alert after sustained period.
    vi.advanceTimersByTime(
      DEFAULT_ALERT_BACKOFF_MS + DEFAULT_SUSTAINED_DEGRADATION_MS
    );
    expect(fake.getAlerts()).toHaveLength(2);
    client.destroy();
  });

  it("clears state on disconnect", () => {
    const fake = makeHost();
    const client = new MediaStatsClient(fake.host);
    fake.emitRuntimeMessage(buildMediaStats(1));
    fake.emitStatus("disconnected");
    vi.advanceTimersByTime(DEFAULT_SUSTAINED_DEGRADATION_MS + 1);
    expect(fake.getAlerts()).toHaveLength(0);
    client.destroy();
  });

  it("reports isEnabled() false when disabled", () => {
    const fake = makeHost();
    const client = new MediaStatsClient(fake.host, { enabled: false });
    expect(client.isEnabled()).toBe(false);
    fake.emitRuntimeMessage(buildMediaStats(1));
    vi.advanceTimersByTime(DEFAULT_SUSTAINED_DEGRADATION_MS + 1);
    expect(fake.getAlerts()).toHaveLength(0);
    client.destroy();
  });

  it("does not process messages when disabled", () => {
    const fake = makeHost();
    const client = new MediaStatsClient(fake.host, { enabled: false });
    client.deliver(buildMediaStats(1));
    vi.advanceTimersByTime(DEFAULT_SUSTAINED_DEGRADATION_MS + 1);
    expect(fake.getAlerts()).toHaveLength(0);
    client.destroy();
  });

  it("destroy() unsubscribes and clears timers", () => {
    const fake = makeHost();
    const client = new MediaStatsClient(fake.host);
    fake.emitRuntimeMessage(buildMediaStats(1));
    client.destroy();
    expect(fake.isRuntimeMessageUnsubscribed()).toBe(true);
    vi.advanceTimersByTime(DEFAULT_SUSTAINED_DEGRADATION_MS + 1);
    expect(fake.getAlerts()).toHaveLength(0);
  });

  it("uses a custom degraded message when configured", () => {
    const fake = makeHost();
    const custom = "Network is slow.";
    const client = new MediaStatsClient(fake.host, {
      degradedMessage: custom,
    });
    fake.emitRuntimeMessage(buildMediaStats(1));
    vi.advanceTimersByTime(DEFAULT_SUSTAINED_DEGRADATION_MS);
    expect(fake.getAlerts()[0]?.data.message).toBe(custom);
    client.destroy();
  });
});
