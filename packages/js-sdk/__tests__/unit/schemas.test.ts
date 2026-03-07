// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

import { describe, it, expect } from "vitest";
import {
  CreateSessionRequestSchema,
  CreateSessionResponseSchema,
  SDPParamsRequestSchema,
  SDPParamsResponseSchema,
  IceServersResponseSchema,
  SessionState,
} from "../../src/core/types";

describe("CreateSessionRequestSchema", () => {
  it("validates a correct request", () => {
    const data = {
      model: { name: "echo" },
      sdp_offer: "v=0\r\n...",
      extra_args: { key: "value" },
    };
    expect(() => CreateSessionRequestSchema.parse(data)).not.toThrow();
  });

  it("rejects missing model", () => {
    expect(() =>
      CreateSessionRequestSchema.parse({ sdp_offer: "v=0", extra_args: {} })
    ).toThrow();
  });

  it("rejects missing sdp_offer", () => {
    expect(() =>
      CreateSessionRequestSchema.parse({
        model: { name: "echo" },
        extra_args: {},
      })
    ).toThrow();
  });

  it("rejects missing extra_args", () => {
    expect(() =>
      CreateSessionRequestSchema.parse({
        model: { name: "echo" },
        sdp_offer: "v=0",
      })
    ).toThrow();
  });
});

describe("CreateSessionResponseSchema", () => {
  it("validates a UUID session_id", () => {
    const result = CreateSessionResponseSchema.parse({
      session_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.session_id).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("rejects a non-UUID session_id", () => {
    expect(() =>
      CreateSessionResponseSchema.parse({ session_id: "not-a-uuid" })
    ).toThrow();
  });
});

describe("SDPParamsRequestSchema", () => {
  it("validates a correct request", () => {
    const result = SDPParamsRequestSchema.parse({
      sdp_offer: "v=0\r\noffer",
      extra_args: {},
    });
    expect(result.sdp_offer).toBe("v=0\r\noffer");
  });
});

describe("SDPParamsResponseSchema", () => {
  it("validates a correct response", () => {
    const result = SDPParamsResponseSchema.parse({
      sdp_answer: "v=0\r\nanswer",
      extra_args: {},
    });
    expect(result.sdp_answer).toBe("v=0\r\nanswer");
  });
});

describe("IceServersResponseSchema", () => {
  it("validates servers with credentials", () => {
    const result = IceServersResponseSchema.parse({
      ice_servers: [
        {
          uris: ["turn:turn.example.com:3478"],
          credentials: { username: "user", password: "pass" },
        },
      ],
    });
    expect(result.ice_servers).toHaveLength(1);
    expect(result.ice_servers[0].credentials?.username).toBe("user");
  });

  it("validates servers without credentials", () => {
    const result = IceServersResponseSchema.parse({
      ice_servers: [{ uris: ["stun:stun.l.google.com:19302"] }],
    });
    expect(result.ice_servers).toHaveLength(1);
    expect(result.ice_servers[0].credentials).toBeUndefined();
  });

  it("validates an empty server list", () => {
    expect(() =>
      IceServersResponseSchema.parse({ ice_servers: [] })
    ).not.toThrow();
  });

  it("rejects missing ice_servers key", () => {
    expect(() => IceServersResponseSchema.parse({})).toThrow();
  });
});

describe("SessionState enum", () => {
  it("maps expected numeric values", () => {
    expect(SessionState.CREATED).toBe(0);
    expect(SessionState.PENDING).toBe(1);
    expect(SessionState.SUSPENDED).toBe(2);
    expect(SessionState.WAITING).toBe(3);
    expect(SessionState.ACTIVE).toBe(4);
    expect(SessionState.INACTIVE).toBe(5);
    expect(SessionState.CLOSED).toBe(6);
  });
});
