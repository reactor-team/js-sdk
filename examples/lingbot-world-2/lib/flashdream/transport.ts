// Optional flashdream backend transport.
//
// lingbot-world-2 normally streams video from the Reactor cloud SDK
// (@reactor-team/js-sdk -> api.reactor.inc). This module is an OPT-IN alternative:
// it speaks flashdream's local WebRTC world-model server protocol
// (integrations/lingbot -> `python -m lingbot.webrtc.server`, default :8089).
//
// It is a faithful port of flashdream's own browser viewer
// (integrations/lingbot/lingbot/webrtc/web/request_session.js):
//   - RTCPeerConnection + a "controls" DataChannel + recvonly video transceiver
//   - createOffer -> wait for ICE gathering -> POST /api/webrtc/offer -> setRemoteDescription
//   - actions sent as {type:"action", action:{event, key}}; server replies {type:"chunk_done", ...}
//
// Enabled only when NEXT_PUBLIC_FLASHDREAM_URL is set, so the default Reactor
// path is completely unchanged when it is absent.

export type FlashdreamKey = "w" | "a" | "s" | "d" | "q" | "e" | "i" | "j" | "k" | "l";
export type FlashdreamAction =
  | { event: "keydown"; key: FlashdreamKey }
  | { event: "keyup"; key: FlashdreamKey }
  | { event: "step" };

export interface ChunkDone {
  type: "chunk_done";
  chunk_index: number;
  num_frames: number;
  enqueued_frames: number;
}

/** The configured flashdream server base URL, or null when the opt-in is off. */
export function flashdreamUrl(): string | null {
  const u = process.env.NEXT_PUBLIC_FLASHDREAM_URL;
  return u && u.trim() ? u.replace(/\/+$/, "") : null;
}

/** True when the flashdream backend is opted in via env. */
export function flashdreamEnabled(): boolean {
  return flashdreamUrl() !== null;
}

async function waitForIceGatheringComplete(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === "complete") return;
  await new Promise<void>((resolve) => {
    const check = () => {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener("icegatheringstatechange", check);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", check);
    // Safety timeout: some browsers never reach "complete" without a STUN server.
    setTimeout(() => {
      pc.removeEventListener("icegatheringstatechange", check);
      resolve();
    }, 2000);
  });
}

export interface FlashdreamCallbacks {
  onChunkDone?: (c: ChunkDone) => void;
  onConnectionState?: (state: RTCPeerConnectionState) => void;
  onMessage?: (msg: unknown) => void;
}

/**
 * A single flashdream WebRTC session: attaches the generated video stream to a
 * <video> element and sends keydown/keyup/step actions over the control channel.
 */
export class FlashdreamSession {
  private pc: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private readonly base: string;
  private readonly cb: FlashdreamCallbacks;

  constructor(baseUrl: string, cb: FlashdreamCallbacks = {}) {
    this.base = baseUrl.replace(/\/+$/, "");
    this.cb = cb;
  }

  get isOpen(): boolean {
    return this.channel?.readyState === "open";
  }

  /** Connect and route the remote video track into `videoEl`. */
  async connect(videoEl: HTMLVideoElement): Promise<void> {
    const pc = new RTCPeerConnection();
    this.pc = pc;
    this.channel = pc.createDataChannel("controls");
    pc.addTransceiver("video", { direction: "recvonly" });

    this.channel.onmessage = (e) => {
      let msg: unknown;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      this.cb.onMessage?.(msg);
      if (
        msg &&
        typeof msg === "object" &&
        (msg as { type?: string }).type === "chunk_done"
      ) {
        this.cb.onChunkDone?.(msg as ChunkDone);
      }
    };

    pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (stream) videoEl.srcObject = stream;
    };
    pc.onconnectionstatechange = () => {
      this.cb.onConnectionState?.(pc.connectionState);
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIceGatheringComplete(pc);

    const res = await fetch(`${this.base}/api/webrtc/offer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pc.localDescription),
    });
    if (!res.ok) {
      throw new Error(`flashdream offer failed (${res.status}): ${await res.text()}`);
    }
    await pc.setRemoteDescription(await res.json());
  }

  /** Send one action ({event:"keydown"/"keyup"/"step"}). No-op if channel closed. */
  send(action: FlashdreamAction): boolean {
    if (!this.isOpen) return false;
    this.channel!.send(JSON.stringify({ type: "action", action }));
    return true;
  }

  keydown(key: FlashdreamKey): boolean {
    return this.send({ event: "keydown", key });
  }
  keyup(key: FlashdreamKey): boolean {
    return this.send({ event: "keyup", key });
  }
  /** Generate one chunk with the current key state. */
  step(): boolean {
    return this.send({ event: "step" });
  }

  close(): void {
    try {
      this.channel?.close();
      this.pc?.close();
    } finally {
      this.channel = null;
      this.pc = null;
    }
  }
}
