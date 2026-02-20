"use client";

import { useState, useEffect } from "react";
import { ReactorProvider, ReactorView } from "@reactor-team/js-sdk";
import { HeaderControls } from "@/components/HeaderControls";
import { ConnectionPanel } from "@/components/ConnectionPanel";
import { LongLiveController } from "@/components/LongLiveController";
import { Button } from "@/components/ui/button";
import { useReactor } from "@reactor-team/js-sdk";

// Reset button component (needs to be inside ReactorProvider)
function ResetButton() {
  const { sendCommand, status } = useReactor((state) => ({
    sendCommand: state.sendCommand,
    status: state.status,
  }));

  const handleReset = async () => {
    try {
      await sendCommand("reset", {});
      console.log("Reset command sent");
    } catch (error) {
      console.error("Failed to send reset:", error);
    }
  };

  if (status !== "ready") return null;

  return (
    <Button
      size="xs"
      variant="destructive"
      onClick={handleReset}
      className="backdrop-blur-sm"
    >
      Reset
    </Button>
  );
}

export default function Home() {
  const [jwtToken, setJwtToken] = useState<string | undefined>(undefined);
  const [isLocalMode, setIsLocalMode] = useState(false);

  // Ensure dark mode is applied to html element
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      <ReactorProvider
        modelName="livecore"
        jwtToken={jwtToken}
        local={isLocalMode}
        autoConnect={false}
      >
        {/* Header */}
        <HeaderControls />

        {/* Main content - fills remaining viewport */}
        <main className="flex-1 min-h-0 p-3 md:p-4">
          <div className="h-full max-w-5xl mx-auto flex flex-col gap-3">
            {/* Connection panel - above the video */}
            <ConnectionPanel
              onJwtTokenChange={setJwtToken}
              onLocalModeChange={setIsLocalMode}
              className="shrink-0"
            />

            {/* Video view - flexes to fill available space */}
            <div className="relative bg-black rounded-lg overflow-hidden border border-border flex-1 min-h-0">
              {/* Video view */}
              <div className="absolute inset-0">
                <ReactorView className="w-full h-full object-contain" videoObjectFit="cover" />
              </div>

              {/* Top-left: Reset button */}
              <div className="absolute top-3 left-3 pointer-events-auto">
                <ResetButton />
              </div>
            </div>

            {/* Controls panel - stays at bottom */}
            <LongLiveController className="shrink-0" />
          </div>
        </main>
      </ReactorProvider>
    </div>
  );
}
