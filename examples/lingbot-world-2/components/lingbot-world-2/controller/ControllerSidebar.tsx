"use client";

// The controller's left sidebar (Quick Start examples + Custom scene + Advanced
// backend knobs + the layered-scene editor modal), extracted from
// LingbotWorldController's `sidebar` slot. Pure presentational: all state and
// handlers are passed in. The LivePromptInspector branch stays in the controller
// (it swaps this whole slot out), so this is only the default sidebar body.

import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { SidebarExamples } from "@/components/lingbot-world-2/SidebarExamples";
import { LayeredSceneEditor } from "@/components/lingbot-world-2/LayeredSceneEditor";
import {
  EXAMPLES,
  STRUCTURED_EXAMPLES,
  composePrompt,
  emptyScene,
  scenesEqual,
  type StructuredScene,
  type StructuredExample,
} from "@/lib/lingbot-world-prompts";

type AttnWindow = "auto" | "small" | "large";
type KvResetMode = "off" | "auto" | "manual";
type PendingImage = {
  file: File;
  previewUrl: string;
  label: string;
  presetSrc?: string;
} | null;

export function ControllerSidebar({
  // examples
  activeExampleId,
  loadingExampleId,
  isUploading,
  hasOverride,
  applyExample,
  clearOverrideFor,
  openEditorFor,
  // custom scene
  overrides,
  isReady,
  pendingImage,
  sentImagePreview,
  imageInfo,
  fileInputRef,
  selectFile,
  clearPendingImage,
  applyCustomScene,
  // generation
  hasPrompt,
  hasImage,
  canStart,
  startBlockerReason,
  sendLifecycle,
  errorToast,
  // advanced
  advancedOpen,
  setAdvancedOpen,
  inspectorOpen,
  setInspectorOpen,
  rotationSpeed,
  pushRotationSpeed,
  mouseSens,
  setMouseSens,
  seed,
  pushSeed,
  cameraPoseActive,
  attnWindow,
  pushAttnWindow,
  kvCacheResetMode,
  pushKvCacheResetMode,
  triggerKvCacheReset,
  // editor modal
  editingExampleId,
  editingScene,
  handleSceneChange,
  resetEditingExample,
  closeEditor,
  // constants
  customSceneId,
  mouseSensMin,
  mouseSensMax,
}: {
  activeExampleId: string | null;
  loadingExampleId: string | null;
  isUploading: boolean;
  hasOverride: (id: string) => boolean;
  applyExample: (ex: StructuredExample) => void | Promise<void>;
  clearOverrideFor: (id: string) => void;
  openEditorFor: (id: string) => void;
  overrides: Record<string, StructuredScene>;
  isReady: boolean;
  pendingImage: PendingImage;
  sentImagePreview: string | null;
  imageInfo: { w: number; h: number } | null;
  fileInputRef: RefObject<HTMLInputElement | null>;
  selectFile: (file: File) => void;
  clearPendingImage: () => void;
  applyCustomScene: () => void;
  hasPrompt: boolean;
  hasImage: boolean;
  canStart: boolean;
  startBlockerReason: string | null | undefined;
  sendLifecycle: (cmd: "start" | "pause" | "resume" | "reset") => void;
  errorToast: string | null;
  advancedOpen: boolean;
  setAdvancedOpen: Dispatch<SetStateAction<boolean>>;
  inspectorOpen: boolean;
  setInspectorOpen: Dispatch<SetStateAction<boolean>>;
  rotationSpeed: number;
  pushRotationSpeed: (v: number) => void;
  mouseSens: number;
  setMouseSens: (v: number) => void;
  seed: number;
  pushSeed: (v: number) => void;
  cameraPoseActive: boolean;
  attnWindow: AttnWindow;
  pushAttnWindow: (w: AttnWindow) => void;
  kvCacheResetMode: KvResetMode;
  pushKvCacheResetMode: (m: KvResetMode) => void;
  triggerKvCacheReset: () => void;
  editingExampleId: string | null;
  editingScene: StructuredScene | null;
  handleSceneChange: (next: StructuredScene) => void;
  resetEditingExample: () => void;
  closeEditor: () => void;
  customSceneId: string;
  mouseSensMin: number;
  mouseSensMax: number;
}) {
  return (
    <div className="flex flex-col gap-4">
      {/* Quick Start example list — extracted to SidebarExamples */}
      <SidebarExamples
        examples={EXAMPLES}
        activeExampleId={activeExampleId}
        loadingExampleId={loadingExampleId}
        disabled={isUploading || !!loadingExampleId}
        hasOverride={hasOverride}
        onApply={applyExample}
        onClearOverride={clearOverrideFor}
        onEdit={openEditorFor}
      />

      <div className="border-t border-white/[0.06]" />

      {/* Custom layered scene — bring-your-own image + author your own
          layered prompt through the full editor. Use this when none of
          the built-in examples fit. */}
      {(() => {
        const customScene = overrides[customSceneId];
        const customHasContent =
          !!customScene && !scenesEqual(customScene, emptyScene());
        const customComposed = customScene
          ? composePrompt(customScene, false, []).trim()
          : "";
        const customLoading = loadingExampleId === customSceneId;
        const customIsActive = activeExampleId === customSceneId;
        const canApplyCustom =
          isReady &&
          !isUploading &&
          !customLoading &&
          customComposed.length > 0 &&
          (!!pendingImage || !!sentImagePreview);
        const applyBlockerReason = (() => {
          if (!isReady) return "Not connected.";
          if (isUploading || customLoading) return "Uploading…";
          if (!customComposed)
            return "Edit the custom prompt first (default base prose must not be empty).";
          if (!pendingImage && !sentImagePreview)
            return "Pick a starting image first.";
          return undefined;
        })();
        return (
          <div className="flex flex-col gap-3">
            <span className="text-xs font-mono uppercase tracking-widest text-primary">
              Custom scene
            </span>
            <p className="text-[10px] text-white/40 leading-snug">
              Bring your own image, author a full layered prompt (base / camera
              / movement / events), then apply.
            </p>

            {/* Image picker */}
            <div className="flex items-center gap-2 flex-wrap">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) selectFile(f);
                }}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
                className="mono-xs"
              >
                Choose image
              </Button>
              {pendingImage && (
                <div className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={pendingImage.previewUrl}
                    alt={pendingImage.label}
                    className="h-8 w-14 object-cover rounded border border-amber-300/40"
                  />
                  <span className="mono-xs text-amber-300/70 truncate max-w-[100px]">
                    {pendingImage.label}
                  </span>
                  <button
                    type="button"
                    onClick={clearPendingImage}
                    className="mono-xs text-white/40 hover:text-white/80"
                  >
                    x
                  </button>
                </div>
              )}
              {!pendingImage && sentImagePreview && customIsActive && (
                <div className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={sentImagePreview}
                    alt="current"
                    className="h-8 w-14 object-cover rounded border border-white/15"
                  />
                  <span className="mono-xs text-white/40">
                    sent{imageInfo ? ` · ${imageInfo.w}x${imageInfo.h}` : ""}
                  </span>
                </div>
              )}
            </div>

            {/* Layered prompt editor entry */}
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                onClick={() => openEditorFor(customSceneId)}
                className="mono-xs"
              >
                ✎{" "}
                {customHasContent
                  ? "Edit custom prompt"
                  : "+ New custom prompt"}
              </Button>
              {customHasContent && (
                <>
                  <span className="mono-xs text-white/50">
                    {customScene!.events.length} event
                    {customScene!.events.length === 1 ? "" : "s"}
                    {" · "}
                    {customComposed.length} chars
                  </span>
                  <button
                    type="button"
                    onClick={() => clearOverrideFor(customSceneId)}
                    title="Clear your custom scene"
                    className="font-mono text-sm text-white/55 hover:text-red-300 transition-colors"
                  >
                    ↺
                  </button>
                </>
              )}
            </div>

            {/* Apply */}
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                size="sm"
                onClick={applyCustomScene}
                disabled={!canApplyCustom}
                title={applyBlockerReason}
                className="mono-xs"
              >
                {customLoading
                  ? "Applying…"
                  : customIsActive
                    ? "Re-apply custom scene"
                    : "Apply custom scene"}
              </Button>
              {customIsActive && (
                <span className="mono-xs text-amber-300/70">· running</span>
              )}
            </div>
          </div>
        );
      })()}

      <div className="border-t border-white/[0.06]" />

      {/* Generation state pills — visible regardless of which scene path
          (example or custom) is active. */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "w-1.5 h-1.5 rounded-full",
                hasPrompt ? "bg-green-400" : "bg-white/20",
              )}
            />
            <span className="mono-xs text-white/50">Prompt</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "w-1.5 h-1.5 rounded-full",
                hasImage ? "bg-green-400" : "bg-white/20",
              )}
            />
            <span className="mono-xs text-white/50">Image</span>
          </div>
          <div className="flex-1" />
          <Button
            size="sm"
            disabled={!canStart}
            onClick={() => sendLifecycle("start")}
            title={startBlockerReason ?? undefined}
          >
            Start
          </Button>
        </div>
      </div>

      {errorToast && (
        <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 font-mono text-xs text-red-300">
          {errorToast}
        </div>
      )}

      {/* Advanced */}
      <div className="border-t border-white/[0.06] pt-3 flex flex-col gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className="mono-xs uppercase tracking-wider text-white/40 hover:text-white/70 transition-colors"
          >
            {advancedOpen ? "▾" : "▸"} Advanced
          </button>
        </div>

        {advancedOpen && (
          <div className="rounded border border-white/10 bg-white/[0.02] p-3 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <label className="mono-xs uppercase tracking-wider text-white/50 w-28 shrink-0">
                Show prompt
              </label>
              <button
                type="button"
                role="switch"
                aria-checked={inspectorOpen}
                onClick={() => setInspectorOpen((v) => !v)}
                title="Show the composed prompt and per-layer breakdown for the active example"
                className={cn(
                  "relative h-5 w-9 shrink-0 rounded-full transition-colors",
                  inspectorOpen ? "bg-amber-300" : "bg-white/15",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all",
                    inspectorOpen ? "left-[18px]" : "left-0.5",
                  )}
                />
              </button>
              <span className="mono-xs text-white/40">
                {inspectorOpen ? "on — sidebar shows current prompt" : "off"}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <label className="mono-xs uppercase tracking-wider text-white/50 w-28 shrink-0">
                Rotation speed
              </label>
              <input
                type="range"
                min={0}
                max={30}
                step={0.5}
                value={rotationSpeed}
                onChange={(e) => pushRotationSpeed(Number(e.target.value))}
                className="flex-1 accent-amber-300"
              />
              <span className="font-mono text-xs text-white/70 w-20 text-right tabular-nums">
                {rotationSpeed.toFixed(1)}
                <span className="text-white/40"> °/step</span>
              </span>
            </div>
            <div className="flex items-center gap-3">
              <label className="mono-xs uppercase tracking-wider text-white/50 w-28 shrink-0">
                Mouse sens
              </label>
              <input
                type="range"
                min={mouseSensMin}
                max={mouseSensMax}
                step={0.00005}
                value={mouseSens}
                onChange={(e) => setMouseSens(Number(e.target.value))}
                className="flex-1 accent-amber-300"
              />
              <span className="font-mono text-xs text-white/70 w-20 text-right tabular-nums">
                {((mouseSens * 180) / Math.PI).toFixed(3)}
                <span className="text-white/40"> °/px</span>
              </span>
            </div>
            <div className="flex items-center gap-3">
              <label className="mono-xs uppercase tracking-wider text-white/50 w-28 shrink-0">
                Seed
              </label>
              <Input
                type="number"
                value={seed}
                onChange={(e) => pushSeed(Number(e.target.value))}
                className="w-24 font-mono text-xs"
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => pushSeed(Math.floor(Math.random() * 1_000_000))}
              >
                Random
              </Button>
            </div>
            <div className="flex items-center gap-3">
              <label className="mono-xs uppercase tracking-wider text-white/50 w-28 shrink-0">
                Camera pose
              </label>
              <span
                className={cn(
                  "mono-xs",
                  cameraPoseActive ? "text-amber-300" : "text-white/30",
                )}
              >
                {cameraPoseActive
                  ? "active (pose layer driving rotation)"
                  : "inactive — keyboard only"}
              </span>
            </div>
            {/* DiT self-attention window override (backend set_attn_window). */}
            <div className="flex items-center gap-3">
              <label className="mono-xs uppercase tracking-wider text-white/50 w-28 shrink-0">
                Attn window
              </label>
              <div className="flex gap-1">
                {(
                  [
                    [
                      "auto",
                      "Auto — motion-based: small window when still, full window when moving (default)",
                    ],
                    [
                      "small",
                      "Small — force the still (small) attention window always",
                    ],
                    [
                      "large",
                      "Large — force the moving (full) attention window always",
                    ],
                  ] as const
                ).map(([w, title]) => (
                  <button
                    key={w}
                    type="button"
                    disabled={!isReady}
                    onClick={() => pushAttnWindow(w)}
                    title={title}
                    className={cn(
                      "h-7 rounded border px-3 font-mono text-[11px] capitalize transition-colors disabled:opacity-30",
                      attnWindow === w
                        ? "border-amber-300/60 bg-amber-300/20 text-amber-200"
                        : "border-white/15 bg-white/5 text-white/60 hover:bg-white/10",
                    )}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>
            {/* KV-cache/RoPE reset mode (off/auto/manual) + one-shot manual
                trigger (backend set_kv_cache_reset / trigger_kv_cache_reset). */}
            <div className="flex items-start gap-3">
              <label className="mono-xs uppercase tracking-wider text-white/50 w-28 shrink-0 pt-1.5">
                KV reset
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex gap-1">
                  {(
                    [
                      [
                        "off",
                        "Off — no KV-cache reset; RoPE positions grow unbounded on long runs",
                      ],
                      [
                        "auto",
                        "Auto — periodic window reset (~every 27 chunks) + manual trigger (default)",
                      ],
                      [
                        "manual",
                        "Manual — no periodic reset; only the Reset-now button fires one",
                      ],
                    ] as const
                  ).map(([m, title]) => (
                    <button
                      key={m}
                      type="button"
                      disabled={!isReady}
                      onClick={() => pushKvCacheResetMode(m)}
                      title={title}
                      className={cn(
                        "h-7 rounded border px-3 font-mono text-[11px] capitalize transition-colors disabled:opacity-30",
                        kvCacheResetMode === m
                          ? "border-amber-300/60 bg-amber-300/20 text-amber-200"
                          : "border-white/15 bg-white/5 text-white/60 hover:bg-white/10",
                      )}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!isReady || kvCacheResetMode === "off"}
                  onClick={triggerKvCacheReset}
                  title="Force a one-shot KV-cache reset on the next chunk (e.g. at a scene cut). Available in auto and manual modes."
                >
                  Reset now
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Layered-scene editor — full-screen modal overlaying the page. Reads /
          writes the per-example override store so edits persist across re-clicks. */}
      {editingExampleId &&
        editingScene &&
        (() => {
          const isCustom = editingExampleId === customSceneId;
          const pristine = isCustom
            ? undefined
            : STRUCTURED_EXAMPLES[editingExampleId]?.scene;
          const canReset =
            pristine != null && !scenesEqual(editingScene, pristine);
          const title = isCustom
            ? "Edit · Custom scene"
            : `Edit · ${STRUCTURED_EXAMPLES[editingExampleId]?.name ?? editingExampleId}`;
          const subtitle = isCustom
            ? "Author a fully custom layered prompt. Apply it from the Custom card on the right."
            : editingExampleId === activeExampleId
              ? "Editing the currently-running scene — changes apply live."
              : "Pre-editing this scene. Click the example card to apply your edits.";
          return (
            <LayeredSceneEditor
              title={title}
              subtitle={subtitle}
              scene={editingScene}
              pristine={pristine}
              onChange={handleSceneChange}
              onReset={canReset ? resetEditingExample : undefined}
              resetLabel="Reset to example"
              onClose={closeEditor}
            />
          );
        })()}
    </div>
  );
}
