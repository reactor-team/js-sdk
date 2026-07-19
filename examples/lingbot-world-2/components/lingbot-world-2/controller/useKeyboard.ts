"use client";

// Global keyboard handling for the controller, extracted from
// LingbotWorldController. One keydown/keyup effect: WASD move, arrow-key look
// (routed through camera_pose, preempts mouse-look), Space/J jump, C crouch,
// Q/E roll, O orbit-mute, number keys 1-9 = player hold-events, letters =
// director events. All state/handlers are passed in; the key maps + slot
// helpers come from ./input.

import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import {
  KEY_TO_MOVE_L,
  KEY_TO_MOVE_LAT,
  KEY_TO_LOOK_H,
  KEY_TO_LOOK_V,
  ORBIT_RADIUS_DEFAULT,
  keyToHoldSlot,
  keyToDirectorIndex,
  type MoveL,
  type MoveLat,
  type LookH,
  type LookV,
} from "@/components/lingbot-world-2/controller/input";

export function useKeyboard({
  moveLStackRef,
  moveLatStackRef,
  mouseLookRef,
  vertDirRef,
  lastOrbitRadiusRef,
  applyMovementStack,
  pushLookH,
  pushLookV,
  holdPress,
  holdRelease,
  setVert,
  setRoll,
  onJumpDown,
  onJumpUp,
  setOrbitRadius,
  fireDirectorEvent,
}: {
  moveLStackRef: MutableRefObject<Array<Exclude<MoveL, "idle">>>;
  moveLatStackRef: MutableRefObject<Array<Exclude<MoveLat, "idle">>>;
  mouseLookRef: MutableRefObject<boolean>;
  vertDirRef: MutableRefObject<number>;
  lastOrbitRadiusRef: MutableRefObject<number>;
  applyMovementStack: () => void;
  pushLookH: (next: LookH) => void;
  pushLookV: (next: LookV) => void;
  holdPress: (slot: number) => void;
  holdRelease: (slot: number) => void;
  setVert: (dir: number) => void;
  setRoll: (dir: number) => void;
  onJumpDown: () => void;
  onJumpUp: () => void;
  setOrbitRadius: Dispatch<SetStateAction<number>>;
  fireDirectorEvent: (dirIndex: number) => void;
}) {
  useEffect(() => {
    const isTypingTarget = (el: EventTarget | null): boolean => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
    };

    // When a movement / look key is pressed but a button (or other
    // focusable, non-typing element) inside a scrollable ancestor still
    // holds focus, the browser may scroll that ancestor before our window
    // handler runs preventDefault. Move focus off such elements before
    // dispatching, so the only effect of the key is the controller action.
    const blurFocusedNonTyping = () => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return;
      if (isTypingTarget(el)) return;
      el.blur?.();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (isTypingTarget(e.target)) return;

      const mvL = KEY_TO_MOVE_L[e.key];
      if (mvL) {
        e.preventDefault();
        blurFocusedNonTyping();
        const stack = moveLStackRef.current;
        if (!stack.includes(mvL)) stack.push(mvL);
        applyMovementStack();
        return;
      }
      const mvLat = KEY_TO_MOVE_LAT[e.key];
      if (mvLat) {
        e.preventDefault();
        blurFocusedNonTyping();
        const stack = moveLatStackRef.current;
        if (!stack.includes(mvLat)) stack.push(mvLat);
        applyMovementStack();
        return;
      }
      // Arrow look feeds the same camera_pose yaw/pitch as mouse-look (see
      // ARROW_LOOK_SPEED / sendCameraPoseChunk) — a steady, fixed-rate look,
      // so it also drives orbit. An arrow key while mouse-look (pointer lock)
      // is engaged still preempts it (release the lock, same as Esc) so the
      // arrows read as a clean, deliberate handoff from free-look.
      const lh = KEY_TO_LOOK_H[e.key];
      if (lh) {
        e.preventDefault();
        blurFocusedNonTyping();
        if (mouseLookRef.current) document.exitPointerLock();
        pushLookH(lh);
        return;
      }
      const lv = KEY_TO_LOOK_V[e.key];
      if (lv) {
        e.preventDefault();
        blurFocusedNonTyping();
        if (mouseLookRef.current) document.exitPointerLock();
        pushLookV(lv);
        return;
      }

      // Esc / M release mouse-look (the cursor is hidden under pointer lock,
      // so the toggle button can't be clicked — a key is the way out).
      if (
        (e.key === "Escape" || e.key === "m" || e.key === "M") &&
        mouseLookRef.current
      ) {
        e.preventDefault();
        document.exitPointerLock();
        return;
      }

      // Space (and J) = Jump (up); C = Crouch (down) — hold controls, like
      // WASD. Crouch is on C, NOT Ctrl: macOS reserves Ctrl+arrows for Spaces /
      // Mission Control and grabs them at the OS level before the page sees the
      // keydown, so a Ctrl-held crouch would silently swallow arrow-look.
      if (e.code === "Space" || e.key === "j" || e.key === "J") {
        e.preventDefault();
        blurFocusedNonTyping();
        onJumpDown();
        return;
      }
      if (e.key === "c" || e.key === "C") {
        e.preventDefault();
        blurFocusedNonTyping();
        setVert(-1);
        return;
      }

      // Q / E = roll (3rd rotation DOF, around the view axis).
      if (e.key === "q" || e.key === "Q") {
        e.preventDefault();
        blurFocusedNonTyping();
        setRoll(-1);
        return;
      }
      if (e.key === "e" || e.key === "E") {
        e.preventDefault();
        blurFocusedNonTyping();
        setRoll(1);
        return;
      }

      // O = mute / un-mute orbit: toggle R between 0 (rotate in place) and the last non-zero radius.
      if (e.key === "o" || e.key === "O") {
        e.preventDefault();
        blurFocusedNonTyping();
        setOrbitRadius((r) =>
          r > 0 ? 0 : lastOrbitRadiusRef.current || ORBIT_RADIUS_DEFAULT,
        );
        return;
      }

      const slot = keyToHoldSlot(e.key);
      if (slot !== undefined) {
        e.preventDefault();
        holdPress(slot);
        return;
      }

      // Alphabetic hotkeys fire DIRECTOR events (checked AFTER all player controls
      // above, so WASD/roll/etc. always win — player actions are never blocked).
      const dir = keyToDirectorIndex(e.key);
      if (dir !== undefined) {
        e.preventDefault();
        fireDirectorEvent(dir);
        return;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const mvL = KEY_TO_MOVE_L[e.key];
      if (mvL) {
        moveLStackRef.current = moveLStackRef.current.filter((m) => m !== mvL);
        applyMovementStack();
        return;
      }
      const mvLat = KEY_TO_MOVE_LAT[e.key];
      if (mvLat) {
        moveLatStackRef.current = moveLatStackRef.current.filter(
          (m) => m !== mvLat,
        );
        applyMovementStack();
        return;
      }
      if (KEY_TO_LOOK_H[e.key]) {
        pushLookH("idle");
        return;
      }
      if (KEY_TO_LOOK_V[e.key]) {
        pushLookV("idle");
        return;
      }
      if (e.code === "Space" || e.key === "j" || e.key === "J") {
        onJumpUp();
        return;
      }
      if (e.key === "c" || e.key === "C") {
        if (vertDirRef.current < 0) setVert(0);
        return;
      }
      if (e.key === "q" || e.key === "Q" || e.key === "e" || e.key === "E") {
        setRoll(0);
        return;
      }
      const slot = keyToHoldSlot(e.key);
      if (slot !== undefined) {
        holdRelease(slot);
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [
    applyMovementStack,
    pushLookH,
    pushLookV,
    holdPress,
    holdRelease,
    setVert,
    setRoll,
    onJumpDown,
    onJumpUp,
    // stable refs / setters below are intentionally omitted (match original)
    moveLStackRef,
    moveLatStackRef,
    mouseLookRef,
    vertDirRef,
    lastOrbitRadiusRef,
    setOrbitRadius,
    fireDirectorEvent,
  ]);
}
