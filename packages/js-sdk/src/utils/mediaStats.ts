/**
 * Stateless primitives for the MediaStats QoS alert monitor.
 *
 * Wire contract mirrors `RuntimeMessageType.MEDIA_STATS` in
 * `reactor_runtime/utils/messages.py`. Stateful monitoring lives in
 * `core/MediaStatsClient.ts`.
 */

import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Runtime message types (mirrors RuntimeMessageType in Python)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Names of runtime-scoped messages used by the media stats feature.
 * Inbound `mediaStats` is consumed privately by {@link MediaStatsClient};
 * outbound `alert` is synthesized onto the public `runtimeMessage` bus.
 */
export const RuntimeMediaStatsMessageType = {
  MEDIA_STATS: "mediaStats",
  ALERT: "alert",
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Defaults
// ─────────────────────────────────────────────────────────────────────────────

/** Minimum acceptable `video.aggregateQos` (0–10 scale). */
export const DEFAULT_MIN_AGGREGATE_QOS = 3;

/** How long QoS must stay below threshold before alerting (ms). */
export const DEFAULT_SUSTAINED_DEGRADATION_MS = 15_000;

/** Minimum time between repeated alerts while degraded (ms). */
export const DEFAULT_ALERT_BACKOFF_MS = 60_000;

export const DEFAULT_DEGRADED_NETWORK_MESSAGE =
  "Your network connection quality is poor. You may experience degraded video quality.";

// ─────────────────────────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const MediaStatsPayloadSchema = z
  .object({
    video: z
      .object({
        aggregateQos: z.number().finite().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type MediaStatsPayload = z.infer<typeof MediaStatsPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Options
// ─────────────────────────────────────────────────────────────────────────────

export interface MediaStatsMonitorOptions {
  /** Minimum acceptable `video.aggregateQos` (0–10). Default: {@link DEFAULT_MIN_AGGREGATE_QOS}. */
  minAggregateQos?: number;
  /** Sustained degradation duration before alerting (ms). Default: {@link DEFAULT_SUSTAINED_DEGRADATION_MS}. */
  sustainedDegradationMs?: number;
  /** Minimum gap between repeated alerts (ms). Default: {@link DEFAULT_ALERT_BACKOFF_MS}. */
  alertBackoffMs?: number;
  /** Custom alert message text. Default: {@link DEFAULT_DEGRADED_NETWORK_MESSAGE}. */
  degradedMessage?: string;
  /**
   * When `false`, the monitor is disabled and raw `mediaStats` messages
   * pass through on `runtimeMessage`. Default: `true`.
   */
  enabled?: boolean;
}
