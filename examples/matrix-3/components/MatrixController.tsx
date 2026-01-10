"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useReactor } from "@reactor-team/js-sdk";

interface MatrixControllerProps {
  className?: string;
}

// New Control types for Matrix-3
type MouseKey =
  | "camera_up"
  | "camera_down"
  | "camera_l"
  | "camera_r"
  | "camera_ur"
  | "camera_ul"
  | "camera_dr"
  | "camera_dl"
  | "noop";

type KeyboardAction =
  | "forward"
  | "back"
  | "left"
  | "right"
  | "jump"
  | "attack"
  | "noop";

interface KeyButtonProps {
  label: string;
  isActive: boolean;
  isKeyboard: boolean;
  onPress: () => void;
  onRelease: () => void;
  disabled?: boolean;
  className?: string;
}

// Interactive button component
function KeyButton({
  label,
  isActive,
  isKeyboard,
  onPress,
  onRelease,
  disabled,
  className = "",
}: KeyButtonProps) {
  const [isPressed, setIsPressed] = useState(false);
  const pointerIdRef = useRef<number | null>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    pointerIdRef.current = e.pointerId;
    setIsPressed(true);
    onPress();

    if ("vibrate" in navigator) {
      navigator.vibrate(10);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (disabled || pointerIdRef.current !== e.pointerId) return;
    e.preventDefault();
    setIsPressed(false);
    pointerIdRef.current = null;
    onRelease();
  };

  const handlePointerCancel = (e: React.PointerEvent) => {
    if (disabled || pointerIdRef.current !== e.pointerId) return;
    setIsPressed(false);
    pointerIdRef.current = null;
    onRelease();
  };

  const baseClasses =
    "min-w-10 min-h-10 sm:min-w-12 sm:min-h-12 w-full aspect-square rounded-lg font-bold text-xs sm:text-sm transition-all duration-150 select-none cursor-pointer active:scale-95 flex items-center justify-center touch-none";

  const keyboardActiveClasses =
    "bg-slate-600/80 text-white border-2 border-slate-500/50 shadow-lg";
  const keyboardInactiveClasses =
    "bg-gray-700/40 text-gray-400 border-2 border-gray-600/30 hover:bg-gray-600/50 hover:border-gray-500/40";

  const mouseActiveClasses =
    "bg-emerald-600/80 text-white border-2 border-emerald-500/50 shadow-lg";
  const mouseInactiveClasses =
    "bg-gray-700/40 text-gray-400 border-2 border-gray-600/30 hover:bg-gray-600/50 hover:border-gray-500/40";

  const pressedScale = isPressed ? "scale-95" : "";
  const activeClasses = isKeyboard ? keyboardActiveClasses : mouseActiveClasses;
  const inactiveClasses = isKeyboard
    ? keyboardInactiveClasses
    : mouseInactiveClasses;

  return (
    <button
      type="button"
      className={`${baseClasses} ${
        isActive ? activeClasses : inactiveClasses
      } ${pressedScale} ${className}`}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      disabled={disabled}
      style={{ touchAction: "none" }}
    >
      {label}
    </button>
  );
}

export function MatrixController({ className = "" }: MatrixControllerProps) {
  const { status, sendMessage } = useReactor((state) => ({
    status: state.status,
    sendMessage: state.sendMessage,
  }));

  // Track physically pressed keys (or touched buttons)
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set());

  // Derived states to avoid sending duplicate messages
  const [currentMouseKey, setCurrentMouseKey] = useState<MouseKey>("noop");
  const [currentKeyboardAction, setCurrentKeyboardAction] =
    useState<KeyboardAction>("noop");

  // Mouse speed state
  const [mouseSpeed, setMouseSpeed] = useState(0.5);

  // Update set of pressed keys
  const updatePressedKeys = useCallback((key: string, isPressed: boolean) => {
    setPressedKeys((prev) => {
      const newSet = new Set(prev);
      if (isPressed) {
        newSet.add(key);
      } else {
        newSet.delete(key);
      }
      return newSet;
    });
  }, []);

  // Derive Mouse Action from pressed keys (IJKL)
  useEffect(() => {
    let newMouseKey: MouseKey = "noop";

    const i = pressedKeys.has("i");
    const j = pressedKeys.has("j");
    const k = pressedKeys.has("k");
    const l = pressedKeys.has("l");

    if (i && j) newMouseKey = "camera_ul";
    else if (i && l) newMouseKey = "camera_ur";
    else if (k && j) newMouseKey = "camera_dl";
    else if (k && l) newMouseKey = "camera_dr";
    else if (i) newMouseKey = "camera_up";
    else if (k) newMouseKey = "camera_down";
    else if (j) newMouseKey = "camera_l";
    else if (l) newMouseKey = "camera_r";

    if (newMouseKey !== currentMouseKey) {
      setCurrentMouseKey(newMouseKey);
      if (status === "ready") {
        void sendMessage({
          type: "set_mouse_action",
          data: { mouse_key: newMouseKey },
        });
      }
    }
  }, [pressedKeys, currentMouseKey, sendMessage, status]);

  // Derive Keyboard Action from pressed keys (WASD, Space, E)
  useEffect(() => {
    let newAction: KeyboardAction = "noop";

    // Priority: Jump > Attack > Movement
    if (pressedKeys.has(" ")) {
      newAction = "jump";
    } else if (pressedKeys.has("e")) {
      newAction = "attack";
    } else if (pressedKeys.has("w")) {
      newAction = "forward";
    } else if (pressedKeys.has("s")) {
      newAction = "back";
    } else if (pressedKeys.has("a")) {
      newAction = "left";
    } else if (pressedKeys.has("d")) {
      newAction = "right";
    }

    if (newAction !== currentKeyboardAction) {
      setCurrentKeyboardAction(newAction);
      if (status === "ready") {
        void sendMessage({
          type: "set_keyboard_action",
          data: { keyboard_action: newAction },
        });
      }
    }
  }, [pressedKeys, currentKeyboardAction, sendMessage, status]);

  // Handle Mouse Speed Change
  const handleSpeedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const speed = parseFloat(e.target.value);
    setMouseSpeed(speed);
    if (status === "ready") {
      void sendMessage({
        type: "set_mouse_speed",
        data: { mouse_speed: speed },
      });
    }
  };

  const handleReset = async () => {
    try {
      await sendMessage({ type: "reset" });
      console.log("Reset message sent");
    } catch (error) {
      console.error("Failed to send reset:", error);
    }
  };

  // Keyboard Event Listeners
  useEffect(() => {
    if (status !== "ready") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input field
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }

      const key = e.key.toLowerCase();
      if (["w", "a", "s", "d", " ", "e", "i", "j", "k", "l"].includes(key)) {
        // Don't prevent default for everything to avoid blocking browser shortcuts
        // unless it's a game key
        if (key === " ") e.preventDefault();
        updatePressedKeys(key, true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // Ignore if typing in an input field
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }

      const key = e.key.toLowerCase();
      if (["w", "a", "s", "d", " ", "e", "i", "j", "k", "l"].includes(key)) {
        updatePressedKeys(key, false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [status, updatePressedKeys]);

  const isDisabled = status !== "ready";

  return (
    <div
      className={`bg-gray-900/40 rounded-lg p-3 sm:p-4 border border-gray-700/30 ${className} ${
        isDisabled ? "opacity-50 pointer-events-none" : ""
      }`}
    >
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-medium text-gray-400">Controls</span>
        <button
          onClick={handleReset}
          disabled={isDisabled}
          className="px-4 py-1.5 rounded-md bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all text-xs font-medium"
        >
          Reset
        </button>
      </div>

      <div className="flex flex-col gap-6">
        {/* Top Section: Movement and Camera */}
        <div className="flex justify-center gap-8">
          {/* WASD + Actions */}
          <div className="flex flex-col items-center gap-3">
            <h3 className="text-xs font-semibold text-slate-400">Player</h3>
            <div className="grid grid-cols-3 gap-1.5">
              <KeyButton
                label="E"
                isActive={pressedKeys.has("e")}
                isKeyboard={true}
                onPress={() => updatePressedKeys("e", true)}
                onRelease={() => updatePressedKeys("e", false)}
                disabled={isDisabled}
                className="!text-yellow-400 !border-yellow-500/30"
              />
              <KeyButton
                label="W"
                isActive={pressedKeys.has("w")}
                isKeyboard={true}
                onPress={() => updatePressedKeys("w", true)}
                onRelease={() => updatePressedKeys("w", false)}
                disabled={isDisabled}
              />
              <KeyButton
                label="Spc"
                isActive={pressedKeys.has(" ")}
                isKeyboard={true}
                onPress={() => updatePressedKeys(" ", true)}
                onRelease={() => updatePressedKeys(" ", false)}
                disabled={isDisabled}
                className="!text-blue-400 !border-blue-500/30 text-[10px]"
              />

              <KeyButton
                label="A"
                isActive={pressedKeys.has("a")}
                isKeyboard={true}
                onPress={() => updatePressedKeys("a", true)}
                onRelease={() => updatePressedKeys("a", false)}
                disabled={isDisabled}
              />
              <KeyButton
                label="S"
                isActive={pressedKeys.has("s")}
                isKeyboard={true}
                onPress={() => updatePressedKeys("s", true)}
                onRelease={() => updatePressedKeys("s", false)}
                disabled={isDisabled}
              />
              <KeyButton
                label="D"
                isActive={pressedKeys.has("d")}
                isKeyboard={true}
                onPress={() => updatePressedKeys("d", true)}
                onRelease={() => updatePressedKeys("d", false)}
                disabled={isDisabled}
              />
            </div>
            <div className="flex gap-2 text-[10px] text-gray-500">
              <span>E: Interact</span>
              <span>Spc: Jump</span>
            </div>
          </div>

          {/* IJKL Camera */}
          <div className="flex flex-col items-center gap-3">
            <h3 className="text-xs font-semibold text-emerald-400">Camera</h3>
            <div className="grid grid-cols-3 gap-1.5">
              <div />
              <KeyButton
                label="I"
                isActive={pressedKeys.has("i")}
                isKeyboard={false}
                onPress={() => updatePressedKeys("i", true)}
                onRelease={() => updatePressedKeys("i", false)}
                disabled={isDisabled}
              />
              <div />
              <KeyButton
                label="J"
                isActive={pressedKeys.has("j")}
                isKeyboard={false}
                onPress={() => updatePressedKeys("j", true)}
                onRelease={() => updatePressedKeys("j", false)}
                disabled={isDisabled}
              />
              <KeyButton
                label="K"
                isActive={pressedKeys.has("k")}
                isKeyboard={false}
                onPress={() => updatePressedKeys("k", true)}
                onRelease={() => updatePressedKeys("k", false)}
                disabled={isDisabled}
              />
              <KeyButton
                label="L"
                isActive={pressedKeys.has("l")}
                isKeyboard={false}
                onPress={() => updatePressedKeys("l", true)}
                onRelease={() => updatePressedKeys("l", false)}
                disabled={isDisabled}
              />
            </div>
          </div>
        </div>

        {/* Mouse Speed Slider */}
        <div className="px-2">
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>Mouse Sensitivity</span>
            <span>{mouseSpeed.toFixed(1)}</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={mouseSpeed}
            onChange={handleSpeedChange}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            disabled={isDisabled}
          />
        </div>

        <div className="text-center">
          <p className="text-[10px] text-gray-500">
            Tap buttons or use keyboard keys (WASD + E + Space, IJKL)
          </p>
        </div>
      </div>
    </div>
  );
}
