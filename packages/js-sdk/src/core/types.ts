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
  mid: z.string(),
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

// Mirrors the proto Command message.
export const CommandCapabilitySchema = z.object({
  name: z.string(),
  description: z.string(),
  schema: z.record(z.string(), z.any()).optional(),
});

// Mirrors the proto TransportCapabilities message.
export const CapabilitiesSchema = z.object({
  protocol_version: z.string(),
  tracks: z.array(TrackCapabilitySchema),
  commands: z.array(CommandCapabilitySchema).optional(),
  emission_fps: z.number().nullable().optional(),
});

// GET /sessions/{id}/info — Response (200)
export const SessionInfoResponseSchema = z.object({
  session_id: z.string(),
  state: z.string(),
  cluster: z.string(),
});

// POST /sessions — Response (201)
export const CreateSessionResponseSchema = SessionInfoResponseSchema.extend({
  model: z.object({ name: z.string(), version: z.string().optional() }),
  server_info: z.object({ server_version: z.string() }),
});

// GET /sessions/{id} — Response (200)
export const SessionResponseSchema = CreateSessionResponseSchema.extend({
  selected_transport: TransportDeclarationSchema.optional(),
  capabilities: CapabilitiesSchema.optional(),
});

// DELETE /sessions/{id} — Request
export const TerminateSessionRequestSchema = z.object({
  reason: z.string().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Upload API Schemas
// ─────────────────────────────────────────────────────────────────────────────

// POST /sessions/{id}/uploads — Request
export const CreateUploadRequestSchema = z.object({
  name: z.string(),
  size: z.number().int().positive(),
  mime_type: z.string(),
});

// POST /sessions/{id}/uploads — Response (201)
export const CreateUploadResponseSchema = z.object({
  presigned_id: z.string(),
  presigned_url: z.string(),
  path: z.string(),
});

// ─────────────────────────────────────────────────────────────────────────────
// WebRTC Transport Schemas
// ─────────────────────────────────────────────────────────────────────────────

// GET /sessions/{id}/transport/webrtc/ice_servers — Response (200)
export const IceServerCredentialsSchema = z.object({
  username: z.string(),
  password: z.string(),
});

export const IceServerSchema = z.object({
  uris: z.array(z.string()),
  credentials: IceServerCredentialsSchema.optional(),
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

// POST/PUT /sessions/{id}/transport/webrtc/sdp_params — Response (202)
// connection_id is returned by multi-connection runtimes; absent on older servers.
export const WebRTCSdpOfferResponseSchema = z.object({
  connection_id: z.number().optional(),
});

// GET /sessions/{id}/transport/webrtc/sdp_params — Response (200)
export const WebRTCSdpAnswerResponseSchema = z.object({
  sdp_answer: z.string(),
  connection_id: z.number().optional(),
});

export const IceCandidateSchema = z.object({
  candidate: z.string(),
  sdp_mid: z.string().optional(),
  sdp_mline_index: z.number().optional(),
});

// POST /sessions/{id}/transport/webrtc/ice_candidates — Request
export const IceCandidatesRequestSchema = z.object({
  candidates: z.array(IceCandidateSchema),
  is_final: z.boolean(),
  client_info: ClientInfoSchema.optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Inferred TypeScript Types
// ─────────────────────────────────────────────────────────────────────────────

export type ClientInfo = z.infer<typeof ClientInfoSchema>;
export type TransportDeclaration = z.infer<typeof TransportDeclarationSchema>;
export type TrackCapability = z.infer<typeof TrackCapabilitySchema>;
export type CommandCapability = z.infer<typeof CommandCapabilitySchema>;
export type TrackMappingEntry = z.infer<typeof TrackMappingEntrySchema>;

export type CreateSessionRequest = z.infer<typeof CreateSessionRequestSchema>;
export type CreateSessionResponse = z.infer<typeof CreateSessionResponseSchema>;
export type SessionResponse = z.infer<typeof SessionResponseSchema>;
export type Capabilities = z.infer<typeof CapabilitiesSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Model Schema (OpenAPI document)
// ─────────────────────────────────────────────────────────────────────────────

/** One OpenAPI operation (the `post` of an event/webhook path item). */
export interface ModelSchemaOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  requestBody?: {
    required?: boolean;
    content?: Record<string, { schema?: Record<string, unknown> }>;
  };
  responses?: Record<string, unknown>;
  [key: string]: unknown;
}

/** An OpenAPI path item; the runtime only populates `post`. */
export interface ModelSchemaPathItem {
  post?: ModelSchemaOperation;
  [key: string]: unknown;
}

/**
 * The model's OpenAPI 3.1 schema, returned by the runtime in response to a
 * `requestSchema` runtime-channel command. This is a pass-through of the
 * runtime's document, not a shape the SDK reshapes: client-triggerable
 * events live under `paths` as `POST /events/<name>` operations, outbound
 * model messages under `webhooks`, and media tracks under `x-reactor.tracks`.
 * Read the parts you need.
 */
export interface ModelSchema {
  openapi: string;
  info: { title: string; version: string; description?: string };
  paths?: Record<string, ModelSchemaPathItem>;
  webhooks?: Record<string, ModelSchemaPathItem>;
  "x-reactor"?: {
    tracks?: Array<{ name: string; kind: string; direction: string }>;
  };
  components?: Record<string, unknown>;
  [key: string]: unknown;
}

export type SessionInfoResponse = z.infer<typeof SessionInfoResponseSchema>;
export type TerminateSessionRequest = z.infer<
  typeof TerminateSessionRequestSchema
>;

export type CreateUploadRequest = z.infer<typeof CreateUploadRequestSchema>;
export type CreateUploadResponse = z.infer<typeof CreateUploadResponseSchema>;

export type IceServer = z.infer<typeof IceServerSchema>;
export type IceServersResponse = z.infer<typeof IceServersResponseSchema>;

export type WebRTCSdpOfferRequest = z.infer<typeof WebRTCSdpOfferRequestSchema>;
export type WebRTCSdpOfferResponse = z.infer<
  typeof WebRTCSdpOfferResponseSchema
>;
export type WebRTCSdpAnswerResponse = z.infer<
  typeof WebRTCSdpAnswerResponseSchema
>;
export type IceCandidate = z.infer<typeof IceCandidateSchema>;
export type IceCandidatesRequest = z.infer<typeof IceCandidatesRequestSchema>;
