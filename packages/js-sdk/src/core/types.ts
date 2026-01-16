/**
 * Internal types for the Reactor SDK.
 */

import { z } from "zod";

export enum SessionState {
  SESSION_STATE_UNKNOWN = 0,
  SESSION_STATE_WAITING = 1,
  SESSION_STATE_ACTIVE = 2,
  SESSION_STATE_DISCONNECTED = 3,
  SESSION_STATE_CLOSED = 4,
  UNRECOGNIZED = -1,
}

// Schema used for the HTTP POST request to start a session from the CLIENT to the COORDINATOR.
export const CreateSessionRequestSchema = z.object({
  model: z.string(),
  sdp_offer: z.string(),
  extra_args: z.record(z.string(), z.any()), // Dictionary
});

// Schema used to return the session ID that was created.
export const CreateSessionResponseSchema = z.object({
  session_id: z.uuidv4(),
});

// GET /sessions/{session_id}/info
export const SessionStatusResponseSchema = z.object({
  session_id: z.uuidv4(),
  state: SessionState,
});

// Response to GET /session/{session_id} request
export const SessionInfoResponseSchema = SessionStatusResponseSchema.extend({
  session_info: CreateSessionRequestSchema.extend({
    session_id: z.uuidv4(),
  }),
});

// SDPParamsRequest is the request body for PUT /sessions/{session_id}/sdp_params
export const SDPParamsRequestSchema = z.object({
  sdp_offer: z.string(),
  extra_args: z.record(z.string(), z.any()), // Dictionary
});

// SDPParamsResponse is the response for GET /sessions/{session_id}/sdp_params
// and for for PUT /sessions/{session_id}/sdp_params.
export const SDPParamsResponseSchema = z.object({
  sdp_answer: z.string(),
  extra_args: z.record(z.string(), z.any()), // Dictionary
});

// Response from GET /ice_servers endpoint (local HTTP runtime)
export const IceServersResponseSchema = z.object({
  ice_servers: z.array(
    z.object({
      urls: z.union([z.string(), z.array(z.string())]),
      username: z.string().optional(),
      credential: z.string().optional(),
    })
  ),
});

// Internal connection status for individual components
export type InternalConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

// Inferred types from Zod schemas
export type CreateSessionRequest = z.infer<typeof CreateSessionRequestSchema>;
export type CreateSessionResponse = z.infer<typeof CreateSessionResponseSchema>;

export type SDPParamsResponse = z.infer<typeof SDPParamsResponseSchema>;
export type SDPParamsRequest = z.infer<typeof SDPParamsRequestSchema>;

export type SessionInfoResponse = z.infer<typeof SessionInfoResponseSchema>;
export type SessionStatusResponse = z.infer<typeof SessionStatusResponseSchema>;

export type IceServersResponse = z.infer<typeof IceServersResponseSchema>;
