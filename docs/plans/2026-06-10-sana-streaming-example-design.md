# SANA Streaming example - design

Date: 2026-06-10
Target: a new `examples/sana-streaming` that matches the helios / lingbot / longlive-v2 boilerplate, built by rewriting the standalone `sana-streaming-demo` (a coworker's app) into the house idiom.

## Goal

Ship a self-contained, runnable Next.js example for **sana-streaming** (Reactor's SANA V2V streaming video editor) that is a true sibling of the existing examples: same structure, same theming, same auth pattern, same docs conventions, discoverable by `create-reactor-app --model sana-streaming`. The existing demo is used as behavioral reference only; the code is rewritten, not copied.

Timeline context: pushing for a Sunday release (design written Wednesday). Determinism over flexibility.

## What sana-streaming does (behavior to reproduce)

A continuous video-to-video editor driven over WebRTC. Two input modes:

- **live** - webcam published to the model's `camera` input track, transformed in real time, transformed frames stream back on `main_video` in ~24-frame chunks.
- **file** - upload a clip (≥33 frames), the model edits it and streams the result back chunk by chunk, shown side-by-side with the original.
- **prompt steering** - re-prompt mid-stream; the new prompt takes effect ~1 chunk later.
- transport: pause / resume / reset, plus a seed input.

The **model is the source of truth.** Only `state` messages mutate local state; the UI gates entirely off the reduced `SanaState`.

Commands out: `set_mode`, `set_video`, `set_prompt`, `set_seed`, `start`, `pause`, `resume`, `reset`.
Messages in (only fields the UI reads): `state`, `command_error`, `generation_reset`, `video_accepted` (plus `chunk_complete` / `prompt_accepted` / `generation_*` which are informational).
Tracks: input `camera` (live), output `main_video`.

## Key architectural decisions

### Generic SDK, no typed model package

`@reactor-models/sana-streaming` does not exist on npm. Unlike the siblings (which use typed `@reactor-models/<model>` packages), this example uses the generic `@reactor-team/js-sdk` directly:
`<ReactorProvider getJwt={fetchToken} modelName="sana-streaming">` (default `apiUrl` `https://api.reactor.inc`), with `useReactor` selectors, `useReactorMessage`, and `<ReactorView track="main_video">`. This is the one necessary divergence from siblings. Bonus: it means the example depends on nothing unpublished, which de-risks the Sunday release.

### Theming follows siblings

Use `@reactor-team/ui` brand/active tokens via `@theme` in `globals.css`, plus the shared `ui/` primitives (Button, Panel, Icon, IconButton, SegmentedToggle, `cn` / `EYEBROW` / `PANEL` / `FOCUS_RING`), zinc surfaces, gold "brand" accent. Dropped from the demo: self-hosted Aeonik / Suisse fonts, gold-shimmer button, noise shadows, Reactor/NVIDIA logos, and `lucide-react` (replaced by the `ui/Icon` set - play / pause / reset all exist).

### Connection follows siblings

No `autoConnect`. A `StatusBadge` Connect/Disconnect surfaces the `disconnected → connecting → waiting → ready` machine, built on `useReactor((s) => ({ status, lastError, connect, disconnect }))`.

### Auth follows siblings

`app/api/reactor/token` GET route (sibling copy): requests a 6h token, returns it with `Cache-Control: private, max-age=<until-expiry>`. The sana coordinator caps the TTL to its server max, so the cache window self-adjusts and the SDK refreshes via `getJwt` on reconnect. Env reduces to just `REACTOR_API_KEY` (drops the demo's `REACTOR_SERVER` / `NEXT_PUBLIC_REACTOR_SERVER` / `NEXT_PUBLIC_MODEL_NAME`). Pointing at dev is a documented one-liner (set `apiUrl` + a dev key), not an env knob.

### Structure follows siblings

`app/components/`, `app/lib/`, relative imports, committed `next-env.d.ts`, `pnpm-workspace.yaml` (`packages: []`), `skill/SKILL.md`, `README.md`, server `page.tsx` gating on `REACTOR_API_KEY` → `<SanaStreamingApp/>` or `<SetupRequired/>`.

### SnapClip

Include `SnapClip.tsx` unchanged from longlive-v2 (model-agnostic, base SDK). Works only if the deployed sana-streaming runtime has recording enabled - verify in the smoke test; remove if not. Failures route to an inline error line, so an unsupported runtime degrades gracefully rather than crashing.

## Constraints carried verbatim (do NOT "fix" - document in SKILL.md)

1. **SDK pinned exactly `2.11.2`.** SDK 2.12+ changed `publishTrack` to require a runtime `publish_track` responder (added in runtime 2.7.10). The deployed image (v0.1.2) pins runtime 2.7.9-0, which predates it, so newer SDKs time out on camera publish. 2.11.2 publishes via bare `replaceTrack()` and works against both old and new runtimes. Unpin once the deployed image is rebuilt on runtime ≥ 2.7.10. Commit the lockfile.
2. **LiveInput uses manual `publish()` + `track.contentHint = "detail"`**, not `<WebcamStream>`. Chrome's encoder ramps resolution at stream start / on bandwidth dips; the model `np.stack`s a chunk of frames and crashes on a mid-chunk resolution change. `"detail"` pins resolution and degrades framerate instead.
3. **FileInput auto-retries `set_video` on transient "decode failed"** (model-side ffmpeg probe race), and CommandError suppresses that one banner so the retry is invisible.

## File tree

```
examples/sana-streaming/
  .env.example                 # REACTOR_API_KEY only
  .gitignore                   # sibling copy
  next.config.ts               # sibling copy
  postcss.config.mjs           # sibling copy
  tsconfig.json                # sibling copy
  next-env.d.ts                # committed
  pnpm-workspace.yaml          # packages: []
  package.json                 # generic SDK pinned 2.11.2 + @reactor-team/ui
  pnpm-lock.yaml               # committed (deterministic install)
  README.md
  public/clips/replace-background-softly.mp4
  skill/SKILL.md
  app/
    layout.tsx
    globals.css
    page.tsx                   # server env-check
    SetupRequired.tsx
    SanaStreamingApp.tsx       # ReactorProvider shell + layout
    api/reactor/token/route.ts
    components/
      Header.tsx
      StatusBadge.tsx
      CommandError.tsx
      ModeInput.tsx            # SegmentedToggle file/live + active input
      LiveInput.tsx
      FileInput.tsx
      Prompt.tsx
      Transport.tsx
      Stage.tsx
      SnapClip.tsx             # unchanged from longlive-v2
      ui/                      # Button, Panel, Icon, IconButton, SegmentedToggle, ui.ts, index.ts
    lib/
      types.ts
      state.ts
      clips.ts
      examples.ts
```

## Layout

- **Header**: title "SANA Streaming" + eyebrow.
- **aside (sidebar)**: StatusBadge, CommandError, ModeInput (mode toggle + LiveInput/FileInput), Prompt (textarea + Apply + preset chips + active prompt), Transport (when started), SnapClip.
- **section (right)**: Stage - `<ReactorView track="main_video">`, side-by-side original/transformed in file mode, cleared overlay after reset, status row (idle/streaming/paused · chunk · prompt).

## Docs

- `skill/SKILL.md` (sibling SKILL frontmatter format, e.g. name `building-sana-streaming-frontends`): folds in the demo's `CLAUDE.md` + `docs/sdk-camera-publish.md` rationale - the generic-SDK approach, the three carried constraints, the connection/state model, the mode model, and the verified-against version snapshot (SDK 2.11.2, image v0.1.2, runtime 2.7.9-0). No separate `docs/` folder (matches siblings: one SKILL.md).
- `README.md`: sibling-style quickstart.
- `examples/README.md`: add a `sana-streaming` row to the table, plus a one-line note that it uses the generic SDK (no typed model package) and pins the SDK exactly. The "Conventions" section's blanket "design tokens from @reactor-team/ui" still holds; the SDK-pin line needs a caveat.

## Verification before release

1. `pnpm install` in the new folder resolves cleanly with the exact pin + `@reactor-team/ui`.
2. `pnpm build` and `pnpm dev` succeed; type-check clean.
3. Live smoke test against prod with a real `rk_` key: connect → webcam live publish → file upload + edit → mid-stream re-prompt → pause/resume/reset. Confirm the command/message contract matches and (separately) whether SnapClip recording is supported.
