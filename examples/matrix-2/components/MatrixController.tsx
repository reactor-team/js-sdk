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

function KeyButton({ label, isActive, isKeyboard }: KeyButtonProps) {
  const baseClasses = "w-10 h-10 rounded font-bold text-sm transition-all duration-200";
  const activeClasses = isKeyboard
    ? "bg-blue-500 text-white border-2 border-blue-600 shadow-lg"
    : "bg-green-500 text-white border-2 border-green-600 shadow-lg";
  const inactiveClasses = "bg-gray-200 text-gray-700 border-2 border-gray-300";

  return (
    <div className={`${baseClasses} ${isActive ? activeClasses : inactiveClasses} flex items-center justify-center`}>
      {label}
    </div>
  );
}

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
            sendMessage({ type: "control", data: newControl });
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
            sendMessage({ type: "control", data: newControl });
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

  if (status !== "ready") {
    return null;
  }

  return (
    <div className={`p-4 bg-white rounded-lg shadow-lg ${className}`}>
      <div className="flex justify-center gap-8">
        {/* WASD Keyboard Controls */}
        <div className="flex flex-col items-center gap-2">
          <h3 className="text-sm font-semibold text-blue-600">
            Keyboard (WASD)
          </h3>
          <div className="grid grid-cols-3 gap-1">
            <div />
            <KeyButton label="W" isActive={currentControl.keyboard_key === "W"} isKeyboard={true} />
            <div />
            <KeyButton label="A" isActive={currentControl.keyboard_key === "A"} isKeyboard={true} />
            <KeyButton label="Q" isActive={currentControl.keyboard_key === "Q"} isKeyboard={true} />
            <KeyButton label="D" isActive={currentControl.keyboard_key === "D"} isKeyboard={true} />
            <div />
            <KeyButton label="S" isActive={currentControl.keyboard_key === "S"} isKeyboard={true} />
            <div />
          </div>
        </div>

        {/* IJKL Mouse Controls */}
        <div className="flex flex-col items-center gap-2">
          <h3 className="text-sm font-semibold text-green-600">
            Mouse (IJKL)
          </h3>
          <div className="grid grid-cols-3 gap-1">
            <div />
            <KeyButton label="I" isActive={currentControl.mouse_key === "I"} isKeyboard={false} />
            <div />
            <KeyButton label="J" isActive={currentControl.mouse_key === "J"} isKeyboard={false} />
            <KeyButton label="U" isActive={currentControl.mouse_key === "U"} isKeyboard={false} />
            <KeyButton label="L" isActive={currentControl.mouse_key === "L"} isKeyboard={false} />
            <div />
            <KeyButton label="K" isActive={currentControl.mouse_key === "K"} isKeyboard={false} />
            <div />
          </div>
        </div>
      </div>
    </div>
  );
}
