"use client";

// Charge (jump) + crouch per-latent pattern editing, extracted from
// LingbotWorldController. Owns the two grid-editor pattern states, their
// localStorage persistence, the load-on-mount, and the cell/reset handlers. The
// controller reads the returned `*Ref` values from its jump-arc + crouch-dip
// logic, and feeds the state values / handlers to the grid-editor modals.

import { useCallback, useEffect, useRef, useState } from "react";

// Latents per chunk on the backend (lingbot-v2 config.yml chunk_size = 3). The
// client sends CHUNK_LATENTS deltas per chunk (18 floats); the backend uses them
// one-to-one (k == target_len), so each latent is steered independently.
export const CHUNK_LATENTS = 3;
// Charge is DISCRETE to match the backend: NUM_CHARGE_LEVELS stages, level k →
// k chunks (k * CHUNK_LATENTS latents). The meter STEPS through levels (dwelling
// LEVEL_DWELL_MS on each, bouncing up/down) instead of filling continuously, so
// what you see is exactly what you fire. Release at level k → a k-chunk arc.
export const NUM_CHARGE_LEVELS = 3; // 1, 2, or 3 chunks
export const LEVEL_DWELL_MS = 400; // time held on each level before stepping

const CROUCH_PATTERN_STORAGE = "lingbot-world-2:crouch-patterns:v1";
const CHARGE_PATTERNS_STORAGE = "lingbot-world-2:charge-patterns:v1";

// Crouch is a press+release action. Two hand-editable one-chunk patterns (grid
// popup, CHUNK_LATENTS cells each, +1 up / 0 still / -1 down): "press" fires on
// C-down (a downward dip), "release" fires on C-up (the reverse, standing
// back up). Defaults: down-then-still on press, up-then-still on release, so a
// press+release nets back to the original height.
export type CrouchPhase = "press" | "release";
export type CrouchPatterns = { press: number[]; release: number[] };
function defaultCrouchPatterns(): CrouchPatterns {
  const still = Array<number>(CHUNK_LATENTS - 1).fill(0);
  return { press: [-1, ...still], release: [1, ...still] };
}
function isCrouchLatents(v: unknown): v is number[] {
  return (
    Array.isArray(v) &&
    v.length === CHUNK_LATENTS &&
    v.every((x) => x === 1 || x === 0 || x === -1)
  );
}
function isValidCrouchPatterns(v: unknown): v is CrouchPatterns {
  const o = v as CrouchPatterns | null;
  return (
    !!o &&
    typeof o === "object" &&
    isCrouchLatents(o.press) &&
    isCrouchLatents(o.release)
  );
}

// Each charge level's arc is a hand-editable per-latent plan (edited in the
// per-level grid popup): an array of length level*CHUNK_LATENTS where each latent
// is +1 up / -1 down / 0 still (a hold/pause). Defaults are SYMMETRIC (equal up
// and down) so the character returns to its launch height:
//   L1 (1 chunk):  up · down            -> [1, 0, -1]
//   L2 (2 chunks): up up null | down down null -> [1,1,0, -1,-1,0]
//   L3 (3 chunks): up×4 · down×4        -> [1,1,1,1, 0, -1,-1,-1,-1]
function defaultChargePattern(level: number): number[] {
  if (level === 2) return [1, 1, 0, -1, -1, 0]; // symmetric per-chunk (up up null; down down null)
  const L = level * CHUNK_LATENTS;
  const still = 1; // one pause latent at the peak
  const up = Math.floor((L - still) / 2); // odd L → symmetric up == down
  const down = L - still - up;
  return [
    ...Array<number>(up).fill(1),
    ...Array<number>(still).fill(0),
    ...Array<number>(down).fill(-1),
  ];
}
function defaultChargePatterns(): number[][] {
  return Array.from({ length: NUM_CHARGE_LEVELS }, (_, i) =>
    defaultChargePattern(i + 1),
  );
}
// Guard against a stale/garbage localStorage payload.
function isValidChargePatterns(v: unknown): v is number[][] {
  return (
    Array.isArray(v) &&
    v.length === NUM_CHARGE_LEVELS &&
    v.every(
      (p, i) =>
        Array.isArray(p) &&
        p.length === (i + 1) * CHUNK_LATENTS &&
        p.every((x) => x === 1 || x === 0 || x === -1),
    )
  );
}

export function useChargeCrouchPatterns() {
  // Hand-editable per-latent arc for each charge level (grid popup). Persisted.
  const [chargePatterns, setChargePatterns] = useState<number[][]>(
    defaultChargePatterns,
  );
  const [editingLevel, setEditingLevel] = useState<number | null>(null); // which level's grid is open
  // Hand-editable one-chunk crouch dip patterns (press + release; grid popup). Persisted.
  const [crouchPatterns, setCrouchPatterns] = useState<CrouchPatterns>(
    defaultCrouchPatterns,
  );
  const [editingCrouch, setEditingCrouch] = useState(false); // crouch grid popup open?

  const crouchPatternsRef = useRef<CrouchPatterns>(crouchPatterns);
  useEffect(() => {
    crouchPatternsRef.current = crouchPatterns;
  }, [crouchPatterns]);
  const chargePatternsRef = useRef<number[][]>(chargePatterns);
  useEffect(() => {
    chargePatternsRef.current = chargePatterns;
  }, [chargePatterns]);

  // Restore saved per-level patterns (validated) so edits survive reloads.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CHARGE_PATTERNS_STORAGE);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (isValidChargePatterns(parsed)) setChargePatterns(parsed);
      }
      const savedCrouch = localStorage.getItem(CROUCH_PATTERN_STORAGE);
      if (savedCrouch) {
        const parsed = JSON.parse(savedCrouch);
        if (isValidCrouchPatterns(parsed)) setCrouchPatterns(parsed);
      }
    } catch {
      /* localStorage unavailable / bad JSON */
    }
  }, []);

  // --- Charge-level grid editing (persisted) ---
  const persistChargePatterns = (next: number[][]) => {
    try {
      localStorage.setItem(CHARGE_PATTERNS_STORAGE, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };
  // Cycle one latent cell: up (+1) → down (-1) → still (0) → up.
  const cycleChargeCell = useCallback((level: number, idx: number) => {
    setChargePatterns((prev) => {
      const next = prev.map((p) => [...p]);
      const cur = next[level - 1][idx];
      next[level - 1][idx] = cur === 1 ? -1 : cur === -1 ? 0 : 1;
      persistChargePatterns(next);
      return next;
    });
  }, []);
  const resetChargeLevel = useCallback((level: number) => {
    setChargePatterns((prev) => {
      const next = prev.map((p) => [...p]);
      next[level - 1] = defaultChargePattern(level);
      persistChargePatterns(next);
      return next;
    });
  }, []);
  // Crouch press/release pattern editing (persisted).
  const persistCrouchPatterns = (next: CrouchPatterns) => {
    try {
      localStorage.setItem(CROUCH_PATTERN_STORAGE, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };
  const cycleCrouchCell = useCallback((phase: CrouchPhase, idx: number) => {
    setCrouchPatterns((prev) => {
      const arr = [...prev[phase]];
      const cur = arr[idx];
      arr[idx] = cur === 1 ? -1 : cur === -1 ? 0 : 1; // up → down → still → up
      const next = { ...prev, [phase]: arr };
      persistCrouchPatterns(next);
      return next;
    });
  }, []);
  const resetCrouchPatterns = useCallback(() => {
    const next = defaultCrouchPatterns();
    setCrouchPatterns(next);
    persistCrouchPatterns(next);
  }, []);

  return {
    chargePatterns,
    chargePatternsRef,
    editingLevel,
    setEditingLevel,
    cycleChargeCell,
    resetChargeLevel,
    crouchPatterns,
    crouchPatternsRef,
    editingCrouch,
    setEditingCrouch,
    cycleCrouchCell,
    resetCrouchPatterns,
  };
}
