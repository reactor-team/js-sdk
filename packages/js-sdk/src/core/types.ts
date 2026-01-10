/**
 * Internal types for the Reactor SDK.
 */

import { z } from "zod";
import { SessionState } from "../generated/api/types/api_types";

// Schema used for the HTTP POST request to start a session from the CLIENT to the COORDINATOR.
export const StartSessionRequestSchema = z.object({
  model: z.string(),
  sdp_offer: z.string(),
  extra_args: z.record(z.string(), z.any()), // Dictionary
});

// Schema used to return the session ID that was created.
export const StartSessionResponseSchema = z.object({
  session_id: z.uuidv4(),
});

// Schema used to return the session information from the COORDINATOR to the CLIENT.
export const GetSessionResponseSchema = z.object({
  session_id: z.uuidv4(),
  model: z.string(),
  status: SessionState,
  sdp_answer: z.string(),
  extra_args: z.record(z.string(), z.any()), // Dictionary
});

// Schema used to return the session status from the COORDINATOR to the CLIENT.
export const GetSessionStatusSchema = z.object({
  session_id: z.uuidv4(),
  status: SessionState,
});

// Used as return type for the request the client does when it needs to fetch the latest SDP answer for the session.
// Useful to re-establish connection without needing the full handshake.
export const GetSessionSDPResponseSchema = z.object({
  sdp_answer: z.string(),
});

// Schema used to reconnect to a session that was interrupted but that can be recovered.
export const ReconnectSessionRequestSchema = z.object({
  session_id: z.uuidv4(),
  sdp_offer: z.string(),
  extra_args: z.record(z.string(), z.any()), // Dictionary
});

// Schema used to terminate a session.
export const TerminateSessionResponseSchema = z.object({
  session_id: z.uuidv4(),
  status: SessionState,
});

// Internal connection status for individual components
export type InternalConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

// Inferred types from Zod schemas
export type StartSessionRequest = z.infer<typeof StartSessionRequestSchema>;
export type StartSessionResponse = z.infer<typeof StartSessionResponseSchema>;

export type GetSessionStatus = z.infer<typeof GetSessionStatusSchema>;
export type GetSessionSDPResponse = z.infer<typeof GetSessionSDPResponseSchema>;

export type TerminateSessionResponse = z.infer<
  typeof TerminateSessionResponseSchema
>;
