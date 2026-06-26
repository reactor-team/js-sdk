/**
 * Per-Reactor media stats client. Subscribes to inbound `mediaStats`
 * runtime messages on a private delivery channel (not forwarded to
 * apps), tracks sustained low `video.aggregateQos`, and synthesizes
 * `{ type: "alert", data: RuntimeAlert }` onto the public
 * `runtimeMessage` bus.
 */

import type { ReactorStatus, RuntimeAlert } from "../types";
import {
  DEFAULT_ALERT_BACKOFF_MS,
  DEFAULT_DEGRADED_NETWORK_MESSAGE,
  DEFAULT_MIN_AGGREGATE_QOS,
  DEFAULT_SUSTAINED_DEGRADATION_MS,
  MediaStatsPayloadSchema,
  RuntimeMediaStatsMessageType,
  type MediaStatsMonitorOptions,
} from "../utils/mediaStats";

/** Slim adapter the {@link MediaStatsClient} requires from its host. */
export interface MediaStatsClientHost {
  /**
   * Subscribe to privately delivered runtime-scoped messages.
   * Reactor delivers only `mediaStats` here — not the public bus.
   */
  onRuntimeMessage: (handler: (message: unknown) => void) => () => void;
  /**
   * Subscribe to status changes (so the client can clear state on
   * disconnect). Returns an unsubscribe function.
   */
  onStatusChanged: (handler: (status: ReactorStatus) => void) => () => void;
  /** Emit a synthesized message onto the public `runtimeMessage` bus. */
  emitRuntimeMessage: (message: { type: string; data: RuntimeAlert }) => void;
}

export class MediaStatsClient {
  private readonly minAggregateQos: number;
  private readonly sustainedDegradationMs: number;
  private readonly alertBackoffMs: number;
  private readonly degradedMessage: string;
  private readonly enabled: boolean;

  private lastAggregateQos: number | null = null;
  private degradationTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffTimer: ReturnType<typeof setTimeout> | null = null;
  private lastAlertAt: number | null = null;

  private readonly unsubscribers: Array<() => void> = [];
  private inboundHandler: ((message: unknown) => void) | undefined;

  constructor(
    private readonly host: MediaStatsClientHost,
    options: MediaStatsMonitorOptions = {}
  ) {
    this.enabled = options.enabled !== false;
    this.minAggregateQos = options.minAggregateQos ?? DEFAULT_MIN_AGGREGATE_QOS;
    this.sustainedDegradationMs =
      options.sustainedDegradationMs ?? DEFAULT_SUSTAINED_DEGRADATION_MS;
    this.alertBackoffMs = options.alertBackoffMs ?? DEFAULT_ALERT_BACKOFF_MS;
    this.degradedMessage =
      options.degradedMessage ?? DEFAULT_DEGRADED_NETWORK_MESSAGE;

    const handler = (message: unknown) => this.onRuntimeMessage(message);
    this.inboundHandler = handler;
    this.unsubscribers.push(this.host.onRuntimeMessage(handler));
    this.unsubscribers.push(
      this.host.onStatusChanged((status) => this.onStatusChanged(status))
    );
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /** Called by Reactor to deliver intercepted `mediaStats` messages. */
  deliver(message: unknown): void {
    this.inboundHandler?.(message);
  }

  destroy(): void {
    this.clearTimers();
    while (this.unsubscribers.length > 0) {
      const off = this.unsubscribers.pop();
      try {
        off?.();
      } catch {
        // Best-effort cleanup.
      }
    }
    this.inboundHandler = undefined;
  }

  private onRuntimeMessage(message: unknown): void {
    if (!this.enabled) return;
    if (!message || typeof message !== "object") return;

    const msg = message as { type?: unknown; data?: unknown };
    if (msg.type !== RuntimeMediaStatsMessageType.MEDIA_STATS) return;

    const parsed = MediaStatsPayloadSchema.safeParse(msg.data);
    if (!parsed.success) return;

    const aggregateQos = parsed.data.video?.aggregateQos;
    if (typeof aggregateQos !== "number" || !Number.isFinite(aggregateQos)) {
      return;
    }

    this.lastAggregateQos = aggregateQos;

    if (aggregateQos >= this.minAggregateQos) {
      this.clearDegradationState();
      return;
    }

    if (this.degradationTimer === null && this.backoffTimer === null) {
      this.armDegradationTimer();
    }
  }

  private onStatusChanged(status: ReactorStatus): void {
    if (status === "disconnected") {
      this.clearDegradationState();
      this.lastAlertAt = null;
    }
  }

  private armDegradationTimer(): void {
    this.clearDegradationTimer();
    this.degradationTimer = setTimeout(() => {
      this.degradationTimer = null;
      this.onDegradationTimerFire();
    }, this.sustainedDegradationMs);
  }

  private onDegradationTimerFire(): void {
    if (!this.isBelowThreshold(this.lastAggregateQos)) {
      this.clearDegradationState();
      return;
    }

    if (this.isInBackoff()) {
      this.scheduleBackoffRearm();
      return;
    }

    this.emitAlert();
    this.lastAlertAt = Date.now();
    this.armDegradationTimer();
  }

  private scheduleBackoffRearm(): void {
    if (this.lastAlertAt === null) return;

    const remaining = this.alertBackoffMs - (Date.now() - this.lastAlertAt);
    if (remaining <= 0) {
      this.onBackoffTimerFire();
      return;
    }

    this.clearBackoffTimer();
    this.backoffTimer = setTimeout(() => {
      this.backoffTimer = null;
      this.onBackoffTimerFire();
    }, remaining);
  }

  private onBackoffTimerFire(): void {
    if (!this.isBelowThreshold(this.lastAggregateQos)) {
      this.clearDegradationState();
      return;
    }

    if (this.isInBackoff()) {
      this.scheduleBackoffRearm();
      return;
    }

    this.emitAlert();
    this.lastAlertAt = Date.now();
    this.armDegradationTimer();
  }

  private emitAlert(): void {
    this.host.emitRuntimeMessage({
      type: RuntimeMediaStatsMessageType.ALERT,
      data: {
        level: "warn",
        message: this.degradedMessage,
      },
    });
  }

  private isBelowThreshold(qos: number | null): boolean {
    return qos !== null && qos < this.minAggregateQos;
  }

  private isInBackoff(): boolean {
    return (
      this.lastAlertAt !== null &&
      Date.now() - this.lastAlertAt < this.alertBackoffMs
    );
  }

  private clearDegradationTimer(): void {
    if (this.degradationTimer !== null) {
      clearTimeout(this.degradationTimer);
      this.degradationTimer = null;
    }
  }

  private clearBackoffTimer(): void {
    if (this.backoffTimer !== null) {
      clearTimeout(this.backoffTimer);
      this.backoffTimer = null;
    }
  }

  private clearTimers(): void {
    this.clearDegradationTimer();
    this.clearBackoffTimer();
  }

  private clearDegradationState(): void {
    this.clearTimers();
    this.lastAggregateQos = null;
  }
}
