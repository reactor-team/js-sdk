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

  it("throws CLIP_NOT_READY when an opt-in slackMs deadline passes with stuck 202", async () => {
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

    // Opt into a bound: deadline already in the past → first poll
    // returns 202, second loop sees Date.now() >= deadline and bails.
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

  it("throws CLIP_NOT_READY when an opt-in maxRetries cap is exhausted", async () => {
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

  it("polls past the predicted-ready epoch by default (no bound → no CLIP_NOT_READY)", async () => {
    // predictedReadyAtMs far in the past used to anchor a 15s deadline;
    // now it is informational only. With no slackMs / maxRetries the
    // stuck 202s keep being retried until the manifest lands.
    let calls = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      calls++;
      if (calls <= 25) {
        return Promise.resolve(
          new Response(null, { status: 202, headers: { "Retry-After": "0" } })
        );
      }
      return Promise.resolve(new Response(SAMPLE_MANIFEST, { status: 200 }));
    }) as any;

    const body = await fetchPlaylist("http://localhost/clips?x=1", {
      predictedReadyAtMs: Date.now() - 60_000,
      minRetryDelayMs: 0,
      maxRetryDelayMs: 0,
    });
    expect(body).toBe(SAMPLE_MANIFEST);
    expect(calls).toBe(26);
  });

  it("polls indefinitely by default and stops only when the signal aborts", async () => {
    let calls = 0;
    globalThis.fetch = vi
      .fn()
      .mockImplementation((_url, init?: RequestInit) => {
        if (init?.signal?.aborted) {
          return Promise.reject(new DOMException("Aborted", "AbortError"));
        }
        calls++;
        return Promise.resolve(
          new Response(null, { status: 202, headers: { "Retry-After": "0" } })
        );
      }) as any;

    const controller = new AbortController();
    const promise = fetchPlaylist("http://localhost/clips?x=1", {
      // Both a past predicted epoch and no bound: the old code would
      // have given up (fallback maxRetries). The new default does not.
      predictedReadyAtMs: Date.now() - 60_000,
      minRetryDelayMs: 0,
      maxRetryDelayMs: 0,
      signal: controller.signal,
    });

    // Let it spin well past the old 5-attempt fallback ceiling.
    await new Promise((r) => setTimeout(r, 20));
    controller.abort();

    await expect(promise).rejects.toBeInstanceOf(DOMException);
    expect(calls).toBeGreaterThan(5);
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

  /** Mock chunk bytes that won't parse as real fMP4. The remux path
   * is stubbed via `__remuxInternals.loadMp4Box` so the assertions
   * below can still match exact byte counts. */
  const initBytes = new Uint8Array([1, 2, 3, 4]);
  const chunk0 = new Uint8Array([5, 6, 7, 8, 9, 10]);
  const chunk1 = new Uint8Array([11, 12, 13]);
  const concatSize =
    initBytes.byteLength + chunk0.byteLength + chunk1.byteLength;

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

  let realLoadMp4Box: typeof __remuxInternals.loadMp4Box;
  beforeEach(() => {
    realLoadMp4Box = __remuxInternals.loadMp4Box;
    // The default for these tests is "remux throws" — exercises the
    // silent-fallback path, which keeps the byte-count assertions on
    // the assembled Blob honest without having to build a real fMP4
    // fixture. Tests that care about the success path override this
    // with a passthrough stub.
    __remuxInternals.loadMp4Box = async () => {
      throw new Error("stubbed");
    };
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => {
    __remuxInternals.loadMp4Box = realLoadMp4Box;
  });

  it("fetches playlist + every chunk and assembles a Blob", async () => {
    installChunkFetchMock();

    const onProgress = vi.fn();
    const blob = await downloadClipAsFile(clip, null, { onProgress });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBe(concatSize);
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

  it("returns the mp4box remuxed bytes when remux succeeds", async () => {
    installChunkFetchMock();
    const remuxed = new Uint8Array([99, 99, 99]);
    // Stub mp4box with a passthrough that drives parse → samples →
    // flush synchronously inside flush(). The output ISOFile's
    // getBuffer() returns the canned remuxed bytes.
    __remuxInternals.loadMp4Box = async () =>
      ({
        createFile: (() => {
          let isInput = true;
          return () => {
            const file: any = {
              onError: undefined,
              onReady: undefined,
              onSamples: undefined,
              init: () => undefined,
              appendBuffer: () => 0,
              start: () => undefined,
              setExtractionOptions: () => undefined,
              addTrack: () => 1,
              addSample: () => undefined,
              getInfo: () => ({ tracks: [{ id: 1 }] }),
              getBuffer: () => ({
                buffer: remuxed.buffer.slice(
                  remuxed.byteOffset,
                  remuxed.byteOffset + remuxed.byteLength
                ),
                byteLength: remuxed.byteLength,
              }),
              flush: undefined as undefined | (() => void),
            };
            if (isInput) {
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
              isInput = false;
            } else {
              file.flush = () => undefined;
            }
            return file;
          };
        })(),
        MP4BoxBuffer: {
          fromArrayBuffer: (ab: ArrayBufferLike, fileStart: number) => {
            const buf = ab.slice(0) as ArrayBuffer & { fileStart: number };
            buf.fileStart = fileStart;
            return buf;
          },
        },
      }) as any;

    const blob = await downloadClipAsFile(clip, null);
    const out = new Uint8Array(await blob.arrayBuffer());
    expect(Array.from(out)).toEqual([99, 99, 99]);
  });

  it("falls back to the byte-concatenated fMP4 on remux failure (logged via console.warn)", async () => {
    installChunkFetchMock();
    // Default beforeEach already stubs loadMp4Box to throw.
    const blob = await downloadClipAsFile(clip, null);
    const out = new Uint8Array(await blob.arrayBuffer());
    expect(out.byteLength).toBe(concatSize);
    expect(out[0]).toBe(initBytes[0]);
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect((console.warn as any).mock.calls[0][0]).toContain("remux failed");
  });
});
