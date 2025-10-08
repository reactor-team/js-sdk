"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useReactor } from "@reactor-team/js-sdk";

interface MatrixControllerProps {
  className?: string;
}

// Control types for the Matrix-2 model
// Mouse controls: IJKL for camera movement, U for neutral/no movement
// Keyboard controls: WASD for player movement, Q for neutral/no movement
type MouseControl = "J" | "K" | "L" | "I" | "U";
type KeyboardControl = "W" | "A" | "S" | "D" | "Q";
type Control = {
  mouse_key: MouseControl;
  keyboard_key: KeyboardControl;
};

interface KeyButtonProps {
  label: string;
  isActive: boolean;
  isKeyboard: boolean;
  onPress: () => void;
  onRelease: () => void;
  disabled?: boolean;
}

// Interactive button component for touch and click control
function KeyButton({
  label,
  isActive,
  isKeyboard,
  onPress,
  onRelease,
  disabled,
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

    // Haptic feedback on supported devices
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

  // Base responsive sizing: larger on mobile, with min-width to preserve gaps
  const baseClasses =
    "min-w-10 min-h-10 sm:min-w-12 sm:min-h-12 w-full aspect-square rounded-lg font-bold text-xs sm:text-sm transition-all duration-150 select-none cursor-pointer active:scale-95";

  // Muted color scheme
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
      } ${pressedScale} flex items-center justify-center touch-none`}
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

/**
 * MatrixController
 *
 * A touch and keyboard-controlled interface for the Matrix-2 model that:
 * - Listens for WASD keys to control player movement
 * - Listens for IJKL keys to control camera movement
 * - Supports touch/click input on buttons for mobile devices
 * - Sends control messages in real-time as keys/buttons are pressed/released
 * - Displays visual feedback for which controls are currently active
 * - Provides a reset button to restart the model
 */
export function MatrixController({ className = "" }: MatrixControllerProps) {
  const { status, sendMessage } = useReactor((state) => ({
    status: state.status,
    sendMessage: state.sendMessage,
  }));

  // Initialize with neutral controls (U = no mouse movement, Q = no keyboard input)
  const [currentControl, setCurrentControl] = useState<Control>({
    mouse_key: "U",
    keyboard_key: "Q",
  });

  // Send control update to the model
  const sendControl = useCallback(
    (control: Control) => {
      void sendMessage({ type: "control", data: control });
    },
    [sendMessage]
  );

  // Handle button press for keyboard controls
  const handleKeyboardPress = useCallback(
    (key: KeyboardControl) => {
      setCurrentControl((prev) => {
        const newControl: Control = {
          mouse_key: prev.mouse_key,
          keyboard_key: key,
        };
        sendControl(newControl);
        return newControl;
      });
    },
    [sendControl]
  );

  // Handle button release for keyboard controls (return to neutral Q)
  const handleKeyboardRelease = useCallback(() => {
    setCurrentControl((prev) => {
      const newControl: Control = {
        mouse_key: prev.mouse_key,
        keyboard_key: "Q",
      };
      sendControl(newControl);
      return newControl;
    });
  }, [sendControl]);

  // Handle button press for mouse controls
  const handleMousePress = useCallback(
    (key: MouseControl) => {
      setCurrentControl((prev) => {
        const newControl: Control = {
          keyboard_key: prev.keyboard_key,
          mouse_key: key,
        };
        sendControl(newControl);
        return newControl;
      });
    },
    [sendControl]
  );

  // Handle button release for mouse controls (return to neutral U)
  const handleMouseRelease = useCallback(() => {
    setCurrentControl((prev) => {
      const newControl: Control = {
        keyboard_key: prev.keyboard_key,
        mouse_key: "U",
      };
      sendControl(newControl);
      return newControl;
    });
  }, [sendControl]);

  // Send reset message to restart the model
  const handleReset = async () => {
    try {
      await sendMessage({ type: "reset" });
      console.log("Reset message sent");
    } catch (error) {
      console.error("Failed to send reset:", error);
    }
  };

  // Handle physical keyboard input for both WASD and IJKL
  const handleKeyboardInput = useCallback(
    (event: KeyboardEvent, isKeyDown: boolean) => {
      const key = event.key.toLowerCase();

      // WASD mapping for keyboard controls (player movement)
      const keyboardMap: Record<string, KeyboardControl> = {
        w: "W",
        a: "A",
        s: "S",
        d: "D",
      };

      // IJKL mapping for mouse controls (camera movement)
      const mouseMap: Record<string, MouseControl> = {
        i: "I",
        j: "J",
        k: "K",
        l: "L",
      };

      if (keyboardMap[key]) {
        event.preventDefault();
        if (isKeyDown) {
          handleKeyboardPress(keyboardMap[key]);
        } else {
          handleKeyboardRelease();
        }
      } else if (mouseMap[key]) {
        event.preventDefault();
        if (isKeyDown) {
          handleMousePress(mouseMap[key]);
        } else {
          handleMouseRelease();
        }
      }
    },
    [
      handleKeyboardPress,
      handleKeyboardRelease,
      handleMousePress,
      handleMouseRelease,
    ]
  );

  // Set up physical keyboard event listeners when connection is ready
  useEffect(() => {
    if (status !== "ready") return;

    const handleKeyDown = (event: KeyboardEvent) => {
      handleKeyboardInput(event, true);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      handleKeyboardInput(event, false);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [status, handleKeyboardInput]);

  const isDisabled = status !== "ready";

  return (
    <div
      className={`bg-gray-900/40 rounded-lg p-3 sm:p-4 border border-gray-700/30 ${className} ${
        isDisabled ? "opacity-50 pointer-events-none" : ""
      }`}
    >
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <span className="text-xs sm:text-sm font-medium text-gray-400">
          Controls
        </span>
        <button
          onClick={handleReset}
          disabled={isDisabled}
          className="px-3 py-1.5 sm:px-4 sm:py-2 rounded-md bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 active:scale-95 transition-all duration-200 text-xs sm:text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Reset
        </button>
      </div>

      {/* Controls layout: side-by-side for dual-thumb control */}
      <div className="flex justify-center gap-4 sm:gap-6 md:gap-8">
        {/* WASD Keyboard Controls - Left side for left thumb */}
        <div className="flex flex-col items-center gap-2 sm:gap-3">
          <h3 className="text-xs sm:text-sm font-semibold text-slate-400">
            Player
          </h3>
          <div className="grid grid-cols-3 gap-1.5 sm:gap-1.5">
            <div />
            <KeyButton
              label="W"
              isActive={currentControl.keyboard_key === "W"}
              isKeyboard={true}
              onPress={() => handleKeyboardPress("W")}
              onRelease={handleKeyboardRelease}
              disabled={isDisabled}
            />
            <div />
            <KeyButton
              label="A"
              isActive={currentControl.keyboard_key === "A"}
              isKeyboard={true}
              onPress={() => handleKeyboardPress("A")}
              onRelease={handleKeyboardRelease}
              disabled={isDisabled}
            />
            <KeyButton
              label="Q"
              isActive={currentControl.keyboard_key === "Q"}
              isKeyboard={true}
              onPress={() => handleKeyboardPress("Q")}
              onRelease={handleKeyboardRelease}
              disabled={isDisabled}
            />
            <KeyButton
              label="D"
              isActive={currentControl.keyboard_key === "D"}
              isKeyboard={true}
              onPress={() => handleKeyboardPress("D")}
              onRelease={handleKeyboardRelease}
              disabled={isDisabled}
            />
            <div />
            <KeyButton
              label="S"
              isActive={currentControl.keyboard_key === "S"}
              isKeyboard={true}
              onPress={() => handleKeyboardPress("S")}
              onRelease={handleKeyboardRelease}
              disabled={isDisabled}
            />
            <div />
          </div>
        </div>

        {/* IJKL Mouse Controls - Right side for right thumb */}
        <div className="flex flex-col items-center gap-2 sm:gap-3">
          <h3 className="text-xs sm:text-sm font-semibold text-emerald-400">
            Camera
          </h3>
          <div className="grid grid-cols-3 gap-1 sm:gap-1.5">
            <div />
            <KeyButton
              label="I"
              isActive={currentControl.mouse_key === "I"}
              isKeyboard={false}
              onPress={() => handleMousePress("I")}
              onRelease={handleMouseRelease}
              disabled={isDisabled}
            />
            <div />
            <KeyButton
              label="J"
              isActive={currentControl.mouse_key === "J"}
              isKeyboard={false}
              onPress={() => handleMousePress("J")}
              onRelease={handleMouseRelease}
              disabled={isDisabled}
            />
            <KeyButton
              label="U"
              isActive={currentControl.mouse_key === "U"}
              isKeyboard={false}
              onPress={() => handleMousePress("U")}
              onRelease={handleMouseRelease}
              disabled={isDisabled}
            />
            <KeyButton
              label="L"
              isActive={currentControl.mouse_key === "L"}
              isKeyboard={false}
              onPress={() => handleMousePress("L")}
              onRelease={handleMouseRelease}
              disabled={isDisabled}
            />
            <div />
            <KeyButton
              label="K"
              isActive={currentControl.mouse_key === "K"}
              isKeyboard={false}
              onPress={() => handleMousePress("K")}
              onRelease={handleMouseRelease}
              disabled={isDisabled}
            />
            <div />
          </div>
        </div>
      </div>

      {/* Helpful hint for mobile users */}
      <div className="mt-3 sm:mt-4 text-center">
        <p className="text-[10px] sm:text-xs text-gray-500">
          Tap and hold buttons or use keyboard keys
        </p>
      </div>
    </div>
  );
}
