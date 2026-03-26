// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

import { describe, it, expect } from "vitest";
import {
  CreateSessionRequestSchema,
  CreateSessionResponseSchema,
  SessionResponseSchema,
  CapabilitiesSchema,
  TrackCapabilitySchema,
  CommandCapabilitySchema,
  IceServersResponseSchema,
  WebRTCSdpOfferRequestSchema,
  WebRTCSdpAnswerResponseSchema,
  SessionState,
} from "../../src/core/types";

describe("CreateSessionRequestSchema", () => {
  it("validates a correct request", () => {
    const data = {
      model: { name: "echo" },
      client_info: { sdk_version: "3.0.0", sdk_type: "js" },
      supported_transports: [{ protocol: "webrtc", version: "1.0" }],
    };
    expect(() => CreateSessionRequestSchema.parse(data)).not.toThrow();
  });

  it("validates with optional extra_args", () => {
    const data = {
      model: { name: "echo" },
      client_info: { sdk_version: "3.0.0", sdk_type: "js" },
      supported_transports: [{ protocol: "webrtc", version: "1.0" }],
      extra_args: { key: "value" },
    };
    expect(() => CreateSessionRequestSchema.parse(data)).not.toThrow();
  });

  it("rejects missing model", () => {
    expect(() =>
      CreateSessionRequestSchema.parse({
        client_info: { sdk_version: "3.0.0", sdk_type: "js" },
        supported_transports: [{ protocol: "webrtc", version: "1.0" }],
      })
    ).toThrow();
  });

  it("rejects missing client_info", () => {
    expect(() =>
      CreateSessionRequestSchema.parse({
        model: { name: "echo" },
        supported_transports: [{ protocol: "webrtc", version: "1.0" }],
      })
    ).toThrow();
  });

  it("rejects missing supported_transports", () => {
    expect(() =>
      CreateSessionRequestSchema.parse({
        model: { name: "echo" },
        client_info: { sdk_version: "3.0.0", sdk_type: "js" },
      })
    ).toThrow();
  });
});

describe("CreateSessionResponseSchema", () => {
  it("validates a session creation response", () => {
    const data = {
      session_id: "85ded560-014c-42df-8902-89dfbca8fa00",
      model: { name: "echo" },
      server_info: { server_version: "1.5.0" },
      state: "CREATED",
      cluster: "sup.us-west-2.aws.prod.reactor.inc",
    };
    const result = CreateSessionResponseSchema.parse(data);
    expect(result.session_id).toBe("85ded560-014c-42df-8902-89dfbca8fa00");
    expect(result.state).toBe("CREATED");
    expect(result.server_info.server_version).toBe("1.5.0");
    expect(result.cluster).toBe("sup.us-west-2.aws.prod.reactor.inc");
  });

  it("accepts non-UUID session IDs", () => {
    const data = {
      session_id: "local",
      model: { name: "echo" },
      server_info: { server_version: "1.0.0" },
      state: "CREATED",
      cluster: "local",
    };
    expect(() => CreateSessionResponseSchema.parse(data)).not.toThrow();
  });
});

describe("SessionResponseSchema", () => {
  it("validates with optional capabilities and transport", () => {
    const data = {
      session_id: "test-id",
      model: { name: "echo" },
      server_info: { server_version: "1.5.0" },
      state: "CREATED",
      cluster: "sup.us-west-2.aws.prod.reactor.inc",
    };
    expect(() => SessionResponseSchema.parse(data)).not.toThrow();
  });

  it("validates with all fields present", () => {
    const data = {
      session_id: "test-id",
      model: { name: "echo", version: "1.0.0" },
      state: "ACTIVE",
      server_info: { server_version: "1.5.0" },
      cluster: "sup.us-west-2.aws.prod.reactor.inc",
      selected_transport: { protocol: "webrtc", version: "1.0" },
      capabilities: {
        protocol_version: "1.0",
        tracks: [],
      },
    };
    const result = SessionResponseSchema.parse(data);
    expect(result.model.version).toBe("1.0.0");
  });
});

describe("CapabilitiesSchema", () => {
  it("validates capabilities with tracks", () => {
    const data = {
      protocol_version: "1.0",
      tracks: [
        { name: "main_video", kind: "video", direction: "recvonly" },
        { name: "webcam", kind: "video", direction: "sendonly" },
      ],
    };
    const result = CapabilitiesSchema.parse(data);
    expect(result.tracks).toHaveLength(2);
  });

  it("validates with optional commands", () => {
    const data = {
      protocol_version: "1.0",
      tracks: [],
      commands: [{ name: "set_effect", description: "Change effect" }],
    };
    const result = CapabilitiesSchema.parse(data);
    expect(result.commands).toHaveLength(1);
  });

  it("validates commands with schema", () => {
    const data = {
      protocol_version: "1.0",
      tracks: [],
      commands: [
        {
          name: "set_effect",
          description: "Change effect",
          schema: {
            type: "object",
            properties: { effect: { type: "string" } },
          },
        },
      ],
    };
    expect(() => CapabilitiesSchema.parse(data)).not.toThrow();
  });

  it("validates with optional emission_fps", () => {
    const data = {
      protocol_version: "1.0",
      tracks: [],
      emission_fps: 30.0,
    };
    const result = CapabilitiesSchema.parse(data);
    expect(result.emission_fps).toBe(30.0);
  });

  it("allows null emission_fps", () => {
    const data = {
      protocol_version: "1.0",
      tracks: [],
      emission_fps: null,
    };
    expect(() => CapabilitiesSchema.parse(data)).not.toThrow();
  });
});

describe("TrackCapabilitySchema", () => {
  it("validates a recvonly video track", () => {
    const result = TrackCapabilitySchema.parse({
      name: "main_video",
      kind: "video",
      direction: "recvonly",
    });
    expect(result.name).toBe("main_video");
    expect(result.kind).toBe("video");
    expect(result.direction).toBe("recvonly");
  });

  it("validates a sendonly audio track", () => {
    const result = TrackCapabilitySchema.parse({
      name: "mic",
      kind: "audio",
      direction: "sendonly",
    });
    expect(result.direction).toBe("sendonly");
  });

  it("rejects invalid kind", () => {
    expect(() =>
      TrackCapabilitySchema.parse({
        name: "track",
        kind: "data",
        direction: "recvonly",
      })
    ).toThrow();
  });

  it("rejects invalid direction", () => {
    expect(() =>
      TrackCapabilitySchema.parse({
        name: "track",
        kind: "video",
        direction: "sendrecv",
      })
    ).toThrow();
  });
});

describe("CommandCapabilitySchema", () => {
  it("validates a command with name and description", () => {
    const result = CommandCapabilitySchema.parse({
      name: "set_prompt",
      description: "Set the text prompt",
    });
    expect(result.name).toBe("set_prompt");
  });

  it("validates a command with optional schema", () => {
    const result = CommandCapabilitySchema.parse({
      name: "set_prompt",
      description: "Set the text prompt",
      schema: { type: "object" },
    });
    expect(result.schema).toBeDefined();
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

describe("WebRTCSdpOfferRequestSchema", () => {
  it("validates a correct SDP offer request", () => {
    const data = {
      sdp_offer: "v=0\r\noffer",
      track_mapping: [
        { mid: "0", name: "main_video", kind: "video", direction: "recvonly" },
      ],
    };
    const result = WebRTCSdpOfferRequestSchema.parse(data);
    expect(result.sdp_offer).toBe("v=0\r\noffer");
    expect(result.track_mapping).toHaveLength(1);
  });

  it("validates with optional client_info", () => {
    const data = {
      sdp_offer: "v=0\r\noffer",
      client_info: { sdk_version: "3.0.0", sdk_type: "js" as const },
      track_mapping: [],
    };
    expect(() => WebRTCSdpOfferRequestSchema.parse(data)).not.toThrow();
  });

  it("rejects missing track_mapping", () => {
    expect(() =>
      WebRTCSdpOfferRequestSchema.parse({ sdp_offer: "v=0\r\noffer" })
    ).toThrow();
  });
});

describe("WebRTCSdpAnswerResponseSchema", () => {
  it("validates a correct SDP answer response", () => {
    const result = WebRTCSdpAnswerResponseSchema.parse({
      sdp_answer: "v=0\r\nanswer",
    });
    expect(result.sdp_answer).toBe("v=0\r\nanswer");
  });

  it("rejects missing sdp_answer", () => {
    expect(() => WebRTCSdpAnswerResponseSchema.parse({})).toThrow();
  });
});

describe("SessionState enum", () => {
  it("maps expected string values", () => {
    expect(SessionState.CREATED).toBe("CREATED");
    expect(SessionState.PENDING).toBe("PENDING");
    expect(SessionState.SUSPENDED).toBe("SUSPENDED");
    expect(SessionState.WAITING).toBe("WAITING");
    expect(SessionState.ACTIVE).toBe("ACTIVE");
    expect(SessionState.INACTIVE).toBe("INACTIVE");
    expect(SessionState.CLOSED).toBe("CLOSED");
  });
});
