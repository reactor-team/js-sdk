"use client";

import { useState, useEffect, useCallback } from "react";
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
}

// Visual button component for displaying individual keys
function KeyButton({ label, isActive, isKeyboard }: KeyButtonProps) {
  const baseClasses =
    "w-10 h-10 rounded font-bold text-xs transition-all duration-200";
  const activeClasses = isKeyboard
    ? "bg-blue-500 text-white border-2 border-blue-600 shadow-lg"
    : "bg-green-500 text-white border-2 border-green-600 shadow-lg";
  const inactiveClasses = "bg-gray-200 text-gray-700 border-2 border-gray-300";

  return (
    <div
      className={`${baseClasses} ${
        isActive ? activeClasses : inactiveClasses
      } flex items-center justify-center`}
    >
      {label}
    </div>
  );
}

/**
 * MatrixController
 *
 * A keyboard-controlled interface for the Matrix-2 model that:
 * - Listens for WASD keys to control player movement
 * - Listens for IJKL keys to control camera movement
 * - Sends control messages in real-time as keys are pressed/released
 * - Displays visual feedback for which keys are currently active
 * - Provides a reset button to restart the model
 */
export function MatrixController({ className = "" }: MatrixControllerProps) {
  const { status, sendMessage } = useReactor((state) => ({
    status: state.status,
    sendMessage: state.sendMessage,
  }));

  // Initialize with neutral controls (U = no mouse movement, Q = no keyboard input)
  // These are valid backend inputs that represent the idle/default state
  const [currentControl, setCurrentControl] = useState<Control>({
    mouse_key: "U",
    keyboard_key: "Q",
  });

  // Send reset message to restart the model
  const handleReset = async () => {
    try {
      await sendMessage({ type: "reset" });
      console.log("Reset message sent");
    } catch (error) {
      console.error("Failed to send reset:", error);
    }
  };

  // Handle keyboard input for both WASD (player movement) and IJKL (camera movement)
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
        setCurrentControl((prev) => {
          // When key is released, return to neutral state (Q)
          const newKeyboardKey = isKeyDown ? keyboardMap[key] : "Q";
          if (prev.keyboard_key !== newKeyboardKey) {
            const newControl: Control = {
              mouse_key: prev.mouse_key,
              keyboard_key: newKeyboardKey,
            };
            void sendMessage({ type: "control", data: newControl });
            return newControl;
          }
          return prev;
        });
      } else if (mouseMap[key]) {
        setCurrentControl((prev) => {
          // When key is released, return to neutral state (U)
          const newMouseKey = isKeyDown ? mouseMap[key] : "U";
          if (prev.mouse_key !== newMouseKey) {
            const newControl: Control = {
              keyboard_key: prev.keyboard_key,
              mouse_key: newMouseKey,
            };
            void sendMessage({ type: "control", data: newControl });
            return newControl;
          }
          return prev;
        });
      }
    },
    [sendMessage]
  );

  // Set up keyboard event listeners when connection is ready
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

  return (
    <div
      className={`bg-gray-900/40 rounded-lg p-3 border border-gray-700/30 ${className} ${
        status !== "ready" ? "opacity-50 pointer-events-none" : ""
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-400">Controls</span>
        <button
          onClick={handleReset}
          className="px-4 py-1.5 rounded-md bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all duration-200 text-xs font-medium"
        >
          Reset Model
        </button>
      </div>
      <div className="flex justify-center gap-6">
        {/* WASD Keyboard Controls */}
        <div className="flex flex-col items-center gap-2">
          <h3 className="text-xs font-semibold text-blue-400">
            Keyboard (WASD)
          </h3>
          <div className="grid grid-cols-3 gap-1">
            <div />
            <KeyButton
              label="W"
              isActive={currentControl.keyboard_key === "W"}
              isKeyboard={true}
            />
            <div />
            <KeyButton
              label="A"
              isActive={currentControl.keyboard_key === "A"}
              isKeyboard={true}
            />
            <KeyButton
              label="Q"
              isActive={currentControl.keyboard_key === "Q"}
              isKeyboard={true}
            />
            <KeyButton
              label="D"
              isActive={currentControl.keyboard_key === "D"}
              isKeyboard={true}
            />
            <div />
            <KeyButton
              label="S"
              isActive={currentControl.keyboard_key === "S"}
              isKeyboard={true}
            />
            <div />
          </div>
        </div>

        {/* IJKL Mouse Controls */}
        <div className="flex flex-col items-center gap-2">
          <h3 className="text-xs font-semibold text-green-400">Mouse (IJKL)</h3>
          <div className="grid grid-cols-3 gap-1">
            <div />
            <KeyButton
              label="I"
              isActive={currentControl.mouse_key === "I"}
              isKeyboard={false}
            />
            <div />
            <KeyButton
              label="J"
              isActive={currentControl.mouse_key === "J"}
              isKeyboard={false}
            />
            <KeyButton
              label="U"
              isActive={currentControl.mouse_key === "U"}
              isKeyboard={false}
            />
            <KeyButton
              label="L"
              isActive={currentControl.mouse_key === "L"}
              isKeyboard={false}
            />
            <div />
            <KeyButton
              label="K"
              isActive={currentControl.mouse_key === "K"}
              isKeyboard={false}
            />
            <div />
          </div>
        </div>
      </div>
    </div>
  );
}
