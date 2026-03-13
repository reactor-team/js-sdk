// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

/**
 * Internal types for the Reactor SDK.
 *
 * All Zod schemas and derived TypeScript types live here.
 * Version constants are sourced from package.json via resolveJsonModule.
 */

import { z } from "zod";
import packageJson from "../../package.json";

// ─────────────────────────────────────────────────────────────────────────────
// Version Constants (single source of truth: package.json)
// ─────────────────────────────────────────────────────────────────────────────

export const REACTOR_SDK_VERSION: string = packageJson.version;
export const REACTOR_API_VERSION: number = (packageJson as any).reactor
  .apiVersion;
export const REACTOR_WEBRTC_VERSION: string = (packageJson as any).reactor
  .webrtcVersion;
export const REACTOR_SDK_TYPE = "js" as const;

// ─────────────────────────────────────────────────────────────────────────────
// Versioning Headers
// ─────────────────────────────────────────────────────────────────────────────

export const API_VERSION_HEADER = "Reactor-API-Version";
export const API_ACCEPT_VERSION_HEADER = "Reactor-API-Accept-Version";
export const WEBRTC_VERSION_HEADER = "Reactor-WebRTC-Version";

export const VERSION_ERROR_CODES = {
  426: "CLIENT_VERSION_TOO_OLD",
  501: "SERVER_VERSION_TOO_OLD",
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Session States
// ─────────────────────────────────────────────────────────────────────────────

export enum SessionState {
  CREATED = "CREATED",
  PENDING = "PENDING",
  SUSPENDED = "SUSPENDED",
  WAITING = "WAITING",
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
  CLOSED = "CLOSED",
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const ClientInfoSchema = z.object({
  sdk_version: z.string(),
  sdk_type: z.literal("js"),
});

export const TransportDeclarationSchema = z.object({
  protocol: z.string(),
  version: z.string(),
});

export const TrackCapabilitySchema = z.object({
  name: z.string(),
  kind: z.enum(["video", "audio"]),
  direction: z.enum(["recvonly", "sendonly"]),
});

export const TrackMappingEntrySchema = TrackCapabilitySchema.extend({
  id: z.union([z.number(), z.string()]),
});

// ─────────────────────────────────────────────────────────────────────────────
// Session API Schemas
// ─────────────────────────────────────────────────────────────────────────────

// POST /sessions — Request
export const CreateSessionRequestSchema = z.object({
  model: z.object({ name: z.string() }),
  client_info: ClientInfoSchema,
  supported_transports: z.array(TransportDeclarationSchema),
  extra_args: z.record(z.string(), z.any()).optional(),
});

// POST /sessions — Response (201)
export const CapabilitiesSchema = z.object({
  version: z.string(),
  tracks: z.array(TrackCapabilitySchema),
  commands: z.record(z.string(), z.any()).optional(),
  emission_fps: z.number().optional(),
});

export const CreateSessionResponseSchema = z.object({
  session_id: z.string().uuid(),
  server_info: z.object({ server_version: z.string() }),
  selected_transport: TransportDeclarationSchema,
  model: z.object({ name: z.string(), version: z.string().optional() }),
  capabilities: CapabilitiesSchema.optional(),
  status: z.string(),
});

// GET /sessions/{id}/info — Response (200)
export const SessionInfoResponseSchema = z.object({
  session_id: z.string().uuid(),
  cluster: z.string().optional(),
  status: z.string(),
});

// DELETE /sessions/{id} — Request
export const TerminateSessionRequestSchema = z.object({
  reason: z.string().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// WebRTC Transport Schemas
// ─────────────────────────────────────────────────────────────────────────────

// GET /sessions/{id}/transport/webrtc/ice_servers — Response (200)
export const IceServerSchema = z.object({
  urls: z.array(z.string()),
  username: z.string().optional(),
  credential: z.string().optional(),
});

export const IceServersResponseSchema = z.object({
  ice_servers: z.array(IceServerSchema),
});

// POST/PUT /sessions/{id}/transport/webrtc/sdp_params — Request
export const WebRTCSdpOfferRequestSchema = z.object({
  sdp_offer: z.string(),
  client_info: ClientInfoSchema.optional(),
  track_mapping: z.array(TrackMappingEntrySchema),
});

// GET /sessions/{id}/transport/webrtc/sdp_params — Response (200)
export const WebRTCSdpAnswerResponseSchema = z.object({
  sdp_answer: z.string(),
  track_mapping: z.array(TrackMappingEntrySchema).optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Inferred TypeScript Types
// ─────────────────────────────────────────────────────────────────────────────

export type ClientInfo = z.infer<typeof ClientInfoSchema>;
export type TransportDeclaration = z.infer<typeof TransportDeclarationSchema>;
export type TrackCapability = z.infer<typeof TrackCapabilitySchema>;
export type TrackMappingEntry = z.infer<typeof TrackMappingEntrySchema>;

export type CreateSessionRequest = z.infer<typeof CreateSessionRequestSchema>;
export type CreateSessionResponse = z.infer<typeof CreateSessionResponseSchema>;
export type Capabilities = z.infer<typeof CapabilitiesSchema>;

export type SessionInfoResponse = z.infer<typeof SessionInfoResponseSchema>;
export type TerminateSessionRequest = z.infer<
  typeof TerminateSessionRequestSchema
>;

export type IceServer = z.infer<typeof IceServerSchema>;
export type IceServersResponse = z.infer<typeof IceServersResponseSchema>;

export type WebRTCSdpOfferRequest = z.infer<typeof WebRTCSdpOfferRequestSchema>;
export type WebRTCSdpAnswerResponse = z.infer<
  typeof WebRTCSdpAnswerResponseSchema
>;
