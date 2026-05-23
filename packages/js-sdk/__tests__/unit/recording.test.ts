import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ClipReadyPayloadSchema,
  RecordingError,
  RuntimeRecordingMessageType,
  __remuxInternals,
  clipFromPayload,
  createPlayableManifestUrl,
  downloadClipAsFile,
  fetchPlaylist,
  parsePlaylist,
  rewriteUrlHost,
} from "../../src/utils/recording";

/** Predicted ready time well in the future so polling tests don't trip the deadline. */
const FUTURE_READY_MS = 9_999_999_999_999;

const SAMPLE_PAYLOAD = {
  session_id: "rec-123",
  kind: "snap" as const,
  start_marker: 120.0,
  end_marker: 150.0,
  now_marker: 150.0,
  predicted_ready_at_ms: FUTURE_READY_MS,
  playlist_url:
    "http://0.0.0.0:8080/clips?session_id=rec-123&start=120&end=150",
};

const SAMPLE_MANIFEST = `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-TARGETDURATION:4
#EXT-X-PLAYLIST-TYPE:VOD
#EXT-X-MAP:URI="/clips/chunks/rec-123/init.mp4"
#EXTINF:4.000,
/clips/chunks/rec-123/chunk_00000.m4s
#EXTINF:4.000,
/clips/chunks/rec-123/chunk_00001.m4s
#EXT-X-ENDLIST
`;

describe("RuntimeRecordingMessageType", () => {
  it("matches the runtime-side string values", () => {
    expect(RuntimeRecordingMessageType.REQUEST_CLIP).toBe("requestClip");
    expect(RuntimeRecordingMessageType.REQUEST_RECORDING).toBe(
      "requestRecording"
    );
    expect(RuntimeRecordingMessageType.CLIP_READY).toBe("clipReady");
    expect(RuntimeRecordingMessageType.CLIP_FAILED).toBe("clipFailed");
  });
});

describe("ClipReadyPayloadSchema", () => {
  it("parses a valid payload", () => {
    const result = ClipReadyPayloadSchema.safeParse(SAMPLE_PAYLOAD);
    expect(result.success).toBe(true);
  });

  it("tolerates extra fields the runtime may add", () => {
    const result = ClipReadyPayloadSchema.safeParse({
      ...SAMPLE_PAYLOAD,
      future_field: "ignored",
    });
    expect(result.success).toBe(true);
  });

  it("rejects payloads missing required fields", () => {
    const { kind: _kind, ...withoutKind } = SAMPLE_PAYLOAD;
    const result = ClipReadyPayloadSchema.safeParse(withoutKind);
    expect(result.success).toBe(false);
  });

  it("rejects unknown kinds", () => {
    const result = ClipReadyPayloadSchema.safeParse({
      ...SAMPLE_PAYLOAD,
      kind: "highlight",
    });
    expect(result.success).toBe(false);
  });
});

describe("clipFromPayload", () => {
  it("converts snake_case to camelCase", () => {
    const clip = clipFromPayload(SAMPLE_PAYLOAD);
    expect(clip.sessionId).toBe("rec-123");
    expect(clip.kind).toBe("snap");
    expect(clip.startMarker).toBe(120);
    expect(clip.endMarker).toBe(150);
    expect(clip.nowMarker).toBe(150);
    expect(clip.predictedReadyAtMs).toBe(FUTURE_READY_MS);
    expect(clip.playlistUrl).toBe(SAMPLE_PAYLOAD.playlist_url);
  });

  it("rewrites playlist URL when coordinatorBaseUrl is provided", () => {
    const clip = clipFromPayload(SAMPLE_PAYLOAD, {
      coordinatorBaseUrl: "http://localhost:9000",
    });
    expect(clip.playlistUrl).toBe(
      "http://localhost:9000/clips?session_id=rec-123&start=120&end=150"
    );
  });

  it("leaves URL unchanged when coordinatorBaseUrl is omitted", () => {
    const clip = clipFromPayload(SAMPLE_PAYLOAD);
    expect(clip.playlistUrl).toBe(SAMPLE_PAYLOAD.playlist_url);
  });
});

describe("rewriteUrlHost", () => {
  it("preserves path and query", () => {
    const out = rewriteUrlHost(
      "http://0.0.0.0:8080/clips?session_id=abc&start=0&end=10",
      "https://api.reactor.inc"
    );
    expect(out).toBe(
      "https://api.reactor.inc/clips?session_id=abc&start=0&end=10"
    );
  });

  it("returns input unchanged on parse failure", () => {
    // Absolute target ("http://...") drives the second URL() call to
    // `new URL(base)`; an empty base throws and the catch returns the
    // input verbatim. A bare "not a url" is a *relative* URL — modern
    // URL parsers happily resolve those (e.g. "http://host/not%20a%20url"),
    // so it doesn't exercise the parse-failure branch.
    expect(rewriteUrlHost("http://example.com/x", "")).toBe(
      "http://example.com/x"
    );
  });
});

describe("parsePlaylist", () => {
  it("extracts init segment and ordered media segments", () => {
    const { initUrl, segmentUrls } = parsePlaylist(
      SAMPLE_MANIFEST,
      "http://localhost:8080/clips?session_id=rec-123&start=0&end=8"
    );
    expect(initUrl).toBe("http://localhost:8080/clips/chunks/rec-123/init.mp4");
    expect(segmentUrls).toEqual([
      "http://localhost:8080/clips/chunks/rec-123/chunk_00000.m4s",
      "http://localhost:8080/clips/chunks/rec-123/chunk_00001.m4s",
    ]);
  });

  it("preserves absolute chunk URLs verbatim", () => {
    const manifest = `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-MAP:URI="https://cdn.reactor.inc/init.mp4"
#EXTINF:4.000,
https://cdn.reactor.inc/chunk_00000.m4s
#EXT-X-ENDLIST
`;
    const { initUrl, segmentUrls } = parsePlaylist(
      manifest,
      "http://localhost/clips?x=1"
    );
    expect(initUrl).toBe("https://cdn.reactor.inc/init.mp4");
    expect(segmentUrls).toEqual(["https://cdn.reactor.inc/chunk_00000.m4s"]);
  });

  it("throws INVALID_PLAYLIST when EXT-X-MAP is missing", () => {
    const broken = `#EXTM3U\n#EXTINF:4.000,\nchunk_00000.m4s\n`;
    expect(() => parsePlaylist(broken, "http://localhost/clips")).toThrow(
      RecordingError
    );
  });

  it("throws INVALID_PLAYLIST when there are no segments", () => {
    const broken = `#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXT-X-ENDLIST\n`;
    expect(() => parsePlaylist(broken, "http://localhost/clips")).toThrow(
      RecordingError
    );
  });
});

describe("createPlayableManifestUrl", () => {
  // The function returns a blob: URL we can't fetch in Node, so we stub
  // URL.createObjectURL to capture the Blob it was called with and read
  // its text back. Native Node Blob has .text() since 18+.
  let capturedBlob: Blob | null;
  let originalCreateObjectURL: typeof URL.createObjectURL | undefined;

  beforeEach(() => {
    capturedBlob = null;
    originalCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = vi.fn((b: Blob) => {
      capturedBlob = b;
      return "blob:reactor-test/abc";
    });
  });

  afterEach(() => {
    if (originalCreateObjectURL) {
      URL.createObjectURL = originalCreateObjectURL;
    } else {
      delete (URL as Partial<typeof URL>).createObjectURL;
    }
  });

  it("absolutizes path-only chunk URLs against the playlist URL (local-runtime regression)", async () => {
    // The HttpRuntime's `/clips` manifest emits path-only chunk URLs.
    // Without rewriting, hls.js resolves them against the page's
    // origin (the dev server, not the runtime) and every chunk 404s.
    const url = createPlayableManifestUrl(
      SAMPLE_MANIFEST,
      "http://localhost:8080/clips?session_id=rec-123&start=0&end=8"
    );
    expect(url).toBe("blob:reactor-test/abc");
    expect(capturedBlob).not.toBeNull();
    const text = await capturedBlob!.text();
    expect(text).toContain(
      '#EXT-X-MAP:URI="http://localhost:8080/clips/chunks/rec-123/init.mp4"'
    );
    expect(text).toContain(
      "http://localhost:8080/clips/chunks/rec-123/chunk_00000.m4s"
    );
    expect(text).toContain(
      "http://localhost:8080/clips/chunks/rec-123/chunk_00001.m4s"
    );
  });

  it("leaves absolute chunk URLs unchanged (production / kind-cluster parity)", async () => {
    const manifest =
      `#EXTM3U\n` +
      `#EXT-X-VERSION:7\n` +
      `#EXT-X-TARGETDURATION:10\n` +
      `#EXT-X-PLAYLIST-TYPE:VOD\n` +
      `#EXT-X-MAP:URI="https://s3.amazonaws.com/bucket/sess/init.mp4?sig=x"\n` +
      `#EXTINF:10.000,\n` +
      `https://s3.amazonaws.com/bucket/sess/chunk_00000.m4s?sig=y\n` +
      `#EXT-X-ENDLIST\n`;
    createPlayableManifestUrl(
      manifest,
      "https://api.reactor.inc/clips?session_id=sess&start=0&end=10"
    );
    const text = await capturedBlob!.text();
    // Absolute URLs passed through verbatim (signed S3 URLs must not
    // be touched — modifying them invalidates the SigV4 signature).
    expect(text).toContain(
      'URI="https://s3.amazonaws.com/bucket/sess/init.mp4?sig=x"'
    );
    expect(text).toContain(
      "https://s3.amazonaws.com/bucket/sess/chunk_00000.m4s?sig=y"
    );
    // Coordinator host must NOT have been injected.
    expect(text).not.toContain("api.reactor.inc/bucket/");
  });

  it("preserves the HLS Content-Type marker", () => {
    createPlayableManifestUrl(
      SAMPLE_MANIFEST,
      "http://localhost:8080/clips?session_id=rec-123"
    );
    expect(capturedBlob!.type).toBe("application/vnd.apple.mpegurl");
  });

  it("preserves comment / directive lines verbatim", async () => {
    createPlayableManifestUrl(
      SAMPLE_MANIFEST,
      "http://localhost:8080/clips?session_id=rec-123"
    );
    const text = await capturedBlob!.text();
    expect(text).toContain("#EXTM3U");
    expect(text).toContain("#EXT-X-VERSION:7");
    expect(text).toContain("#EXT-X-TARGETDURATION:4");
    expect(text).toContain("#EXT-X-PLAYLIST-TYPE:VOD");
    expect(text).toContain("#EXTINF:4.000,");
    expect(text).toContain("#EXT-X-ENDLIST");
  });

  it("throws INVALID_PLAYLIST outside a browser environment", () => {
    delete (URL as Partial<typeof URL>).createObjectURL;
    expect(() =>
      createPlayableManifestUrl(
        SAMPLE_MANIFEST,
        "http://localhost:8080/clips?session_id=rec-123"
      )
    ).toThrow(RecordingError);
  });
});

describe("fetchPlaylist", () => {
  let originalFetch: typeof fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns the body on 200", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response(SAMPLE_MANIFEST, { status: 200 })) as any;
    const body = await fetchPlaylist("http://localhost/clips?x=1");
    expect(body).toBe(SAMPLE_MANIFEST);
  });

  it("retries on 202 then returns 200 (deadline-driven)", async () => {
    let calls = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      calls++;
      if (calls === 1) {
        return Promise.resolve(
          new Response(null, {
            status: 202,
            headers: { "Retry-After": "0" },
          })
        );
      }
      return Promise.resolve(new Response(SAMPLE_MANIFEST, { status: 200 }));
    }) as any;

    const body = await fetchPlaylist("http://localhost/clips?x=1", {
      predictedReadyAtMs: Date.now() + 10_000,
      minRetryDelayMs: 0,
      maxRetryDelayMs: 0,
    });
    expect(body).toBe(SAMPLE_MANIFEST);
    expect(calls).toBe(2);
  });

  it("retries on 202 then returns 200 (legacy maxRetries fallback)", async () => {
    let calls = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      calls++;
      if (calls === 1) {
        return Promise.resolve(
          new Response(null, {
            status: 202,
            headers: { "Retry-After": "0" },
          })
        );
      }
      return Promise.resolve(new Response(SAMPLE_MANIFEST, { status: 200 }));
    }) as any;

    const body = await fetchPlaylist("http://localhost/clips?x=1", {
      minRetryDelayMs: 0,
      maxRetryDelayMs: 0,
    });
    expect(body).toBe(SAMPLE_MANIFEST);
    expect(calls).toBe(2);
  });

  it("throws CLIP_GONE on 410", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 410 })) as any;
    await expect(
      fetchPlaylist("http://localhost/clips?x=1")
    ).rejects.toMatchObject({
      code: "CLIP_GONE",
    });
  });

  it("throws CLIP_GONE on 404", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 404 })) as any;
    await expect(
      fetchPlaylist("http://localhost/clips?x=1")
    ).rejects.toMatchObject({
      code: "CLIP_GONE",
    });
  });

  it("gives the full slack window when polling starts after predictedReadyAtMs (late click)", async () => {
    // Repro for the bug where reading the "ready in Ns" pill for a few
    // seconds before clicking Download caused CLIP_NOT_READY on a
    // clip that landed shortly after. The deadline must run from
    // max(predicted, startedPollingAt), not from predicted alone.
    let calls = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      calls++;
      if (calls < 3) {
        return Promise.resolve(
          new Response(null, {
            status: 202,
            headers: { "Retry-After": "0" },
          })
        );
      }
      return Promise.resolve(new Response(SAMPLE_MANIFEST, { status: 200 }));
    }) as any;

    const body = await fetchPlaylist("http://localhost/clips?x=1", {
      // Predicted time already 5s in the past — late click.
      predictedReadyAtMs: Date.now() - 5_000,
      slackMs: 1_000,
      minRetryDelayMs: 0,
      maxRetryDelayMs: 0,
    });
    expect(body).toBe(SAMPLE_MANIFEST);
    expect(calls).toBe(3);
  });

  it("throws CLIP_NOT_READY when deadline passes with stuck 202", async () => {
    let calls = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      calls++;
      return Promise.resolve(
        new Response(null, {
          status: 202,
          headers: { "Retry-After": "0" },
        })
      );
    }) as any;

    // Deadline already in the past → first poll returns 202, second loop
    // sees Date.now() >= deadline and bails.
    await expect(
      fetchPlaylist("http://localhost/clips?x=1", {
        predictedReadyAtMs: Date.now() - 10_000,
        slackMs: 0,
        minRetryDelayMs: 0,
        maxRetryDelayMs: 0,
      })
    ).rejects.toMatchObject({ code: "CLIP_NOT_READY" });
    expect(calls).toBeGreaterThan(0);
  });

  it("throws CLIP_NOT_READY when fallback maxRetries is exhausted", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 202,
        headers: { "Retry-After": "0" },
      })
    ) as any;
    await expect(
      fetchPlaylist("http://localhost/clips?x=1", {
        maxRetries: 1,
        minRetryDelayMs: 0,
        maxRetryDelayMs: 0,
      })
    ).rejects.toMatchObject({ code: "CLIP_NOT_READY" });
  });

  it("throws PLAYLIST_FETCH_FAILED on other 4xx/5xx", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 500 })) as any;
    await expect(
      fetchPlaylist("http://localhost/clips?x=1")
    ).rejects.toMatchObject({ code: "PLAYLIST_FETCH_FAILED" });
  });
});

describe("downloadClipAsFile", () => {
  const clip = clipFromPayload(SAMPLE_PAYLOAD, {
    coordinatorBaseUrl: "http://localhost:8080",
  });

  /** Mock chunk bytes that won't actually parse as fMP4 — irrelevant
   * for these tests because they only exercise the fetch + concat
   * path and stub `mp4box` out separately. */
  const initBytes = new Uint8Array([1, 2, 3, 4]);
  const chunk0 = new Uint8Array([5, 6, 7, 8, 9, 10]);
  const chunk1 = new Uint8Array([11, 12, 13]);

  function installChunkFetchMock(): ReturnType<typeof vi.fn> {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/clips?")) {
        return Promise.resolve(new Response(SAMPLE_MANIFEST, { status: 200 }));
      }
      if (url.endsWith("/init.mp4")) {
        return Promise.resolve(new Response(initBytes, { status: 200 }));
      }
      if (url.endsWith("/chunk_00000.m4s")) {
        return Promise.resolve(new Response(chunk0, { status: 200 }));
      }
      if (url.endsWith("/chunk_00001.m4s")) {
        return Promise.resolve(new Response(chunk1, { status: 200 }));
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    });
    globalThis.fetch = mockFetch as any;
    return mockFetch;
  }

  /** Saved between tests so we can restore the real dynamic-import
   * loader after each one. Tests below replace it to simulate the
   * peer dep being installed (stub), missing (throw), or broken.
   * `resetFallbackWarning` clears the module-level one-shot latch so
   * each test starts from a clean state. */
  let realLoadMp4Box: typeof __remuxInternals.loadMp4Box;
  beforeEach(() => {
    realLoadMp4Box = __remuxInternals.loadMp4Box;
    __remuxInternals.resetFallbackWarning();
  });
  afterEach(() => {
    __remuxInternals.loadMp4Box = realLoadMp4Box;
  });

  it("fetches playlist + every chunk and assembles a Blob (remux off)", async () => {
    installChunkFetchMock();

    const onProgress = vi.fn();
    const blob = await downloadClipAsFile(clip, null, {
      onProgress,
      remux: "off",
    });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBe(
      initBytes.byteLength + chunk0.byteLength + chunk1.byteLength
    );
    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ fetched: 3, total: 3 })
    );
  });

  it("rejects with CHUNK_FETCH_FAILED when a chunk 5xx's", async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/clips?")) {
        return Promise.resolve(new Response(SAMPLE_MANIFEST, { status: 200 }));
      }
      if (url.endsWith("/init.mp4")) {
        return Promise.resolve(
          new Response(new Uint8Array([1, 2]), { status: 200 })
        );
      }
      return Promise.resolve(new Response(null, { status: 503 }));
    });
    globalThis.fetch = mockFetch as any;

    await expect(downloadClipAsFile(clip, null)).rejects.toMatchObject({
      code: "CHUNK_FETCH_FAILED",
    });
  });

  describe("remux mode", () => {
    /**
     * Minimal mp4box stub that always returns predictable bytes.
     *
     * We don't exercise real fMP4 parsing here — the goal is to
     * verify the `auto` / `force` / `off` branching, fallback, and
     * error mapping. A round-trip test against a real fixture would
     * either ship a binary blob or pull a fixture from disk; covered
     * separately by integration / manual verification.
     */
    function stubMp4boxOnce(opts: {
      output: Uint8Array;
      onCreate?: (file: any, kind: "input" | "output") => void;
    }) {
      let calls = 0;
      const createFile = () => {
        calls++;
        const kind = calls === 1 ? "input" : "output";
        const file: any = {
          onError: undefined,
          onReady: undefined,
          onSamples: undefined,
          init: () => undefined,
          appendBuffer: () => 0,
          flush: () => undefined,
          start: () => undefined,
          setExtractionOptions: () => undefined,
          addTrack: () => 1,
          addSample: () => undefined,
          getInfo: () => ({ tracks: [{ id: 1 }] }),
          getBuffer: () => ({
            buffer: opts.output.buffer.slice(
              opts.output.byteOffset,
              opts.output.byteOffset + opts.output.byteLength
            ),
            byteLength: opts.output.byteLength,
          }),
        };
        opts.onCreate?.(file, kind);
        return file;
      };
      __remuxInternals.loadMp4Box = async () =>
        ({
          createFile,
          MP4BoxBuffer: {
            fromArrayBuffer: (ab: ArrayBufferLike, fileStart: number) => {
              const buf = ab.slice(0) as ArrayBuffer & { fileStart: number };
              buf.fileStart = fileStart;
              return buf;
            },
          },
        }) as any;
    }

    it("auto: returns remuxed bytes when mp4box is available", async () => {
      installChunkFetchMock();
      const remuxed = new Uint8Array([99, 99, 99]);
      stubMp4boxOnce({
        output: remuxed,
        onCreate: (file, kind) => {
          if (kind === "input") {
            // Drive the parse → ready → samples → flush sequence
            // synchronously inside flush() so the awaiting Promise
            // resolves before the call returns.
            file.flush = () => {
              file.onReady?.({ tracks: [{ id: 1 }] });
              file.onSamples?.(1, null, [
                {
                  data: new Uint8Array([0]),
                  duration: 1,
                  dts: 7,
                  cts: 7,
                  is_sync: true,
                  description: { type: "avc1" },
                  timescale: 1000,
                },
              ]);
            };
          }
        },
      });

      const blob = await downloadClipAsFile(clip, null, { remux: "auto" });
      const out = new Uint8Array(await blob.arrayBuffer());
      expect(Array.from(out)).toEqual([99, 99, 99]);
    });

    it("auto: falls back to byte-concat with a one-shot warning when mp4box is missing", async () => {
      installChunkFetchMock();
      __remuxInternals.loadMp4Box = async () => {
        const err: any = new Error("Cannot find module 'mp4box'");
        err.code = "MODULE_NOT_FOUND";
        throw err;
      };
      const warnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);

      const blob = await downloadClipAsFile(clip, null, { remux: "auto" });
      const out = new Uint8Array(await blob.arrayBuffer());
      expect(out.byteLength).toBe(
        initBytes.byteLength + chunk0.byteLength + chunk1.byteLength
      );
      expect(out[0]).toBe(initBytes[0]);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toContain("mp4box");
    });

    it("force: throws REMUX_UNAVAILABLE when mp4box is missing", async () => {
      installChunkFetchMock();
      __remuxInternals.loadMp4Box = async () => {
        throw new Error("Cannot find module 'mp4box'");
      };

      await expect(
        downloadClipAsFile(clip, null, { remux: "force" })
      ).rejects.toMatchObject({
        code: "REMUX_UNAVAILABLE",
      });
    });

    it("force: throws REMUX_FAILED when mp4box throws during remux", async () => {
      installChunkFetchMock();
      stubMp4boxOnce({
        output: new Uint8Array(0),
        onCreate: (file, kind) => {
          if (kind === "input") {
            file.flush = () => {
              throw new Error("corrupt input");
            };
          }
        },
      });

      await expect(
        downloadClipAsFile(clip, null, { remux: "force" })
      ).rejects.toMatchObject({
        code: "REMUX_FAILED",
      });
    });

    it("off: skips mp4box entirely (no dynamic import attempted)", async () => {
      installChunkFetchMock();
      const loader = vi.fn();
      __remuxInternals.loadMp4Box = loader as any;

      const blob = await downloadClipAsFile(clip, null, { remux: "off" });
      expect(blob.size).toBe(
        initBytes.byteLength + chunk0.byteLength + chunk1.byteLength
      );
      expect(loader).not.toHaveBeenCalled();
    });
  });
});
