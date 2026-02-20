"use client";

import { useState, useEffect, useCallback } from "react";
import { ReactorProvider } from "@reactor-team/js-sdk";
import Image from "next/image";
import { ConnectionPanel } from "@/components/ConnectionPanel";
import { FilmDirector } from "@/components/FilmDirector";
import { Button } from "@/components/ui/button";
import { MAX_FRAMES } from "@/lib/constants";
import { Maximize2, Minimize2 } from "lucide-react";

export default function Page() {
  const [jwtToken, setJwtToken] = useState<string | undefined>(undefined);
  const [isLocalMode, setIsLocalMode] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Ensure dark mode is applied to html element
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  // Handle fullscreen changes (e.g., user pressing Escape)
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (error) {
      console.error("Fullscreen error:", error);
    }
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <ReactorProvider
        modelName="livecore"
        jwtToken={jwtToken}
        local={isLocalMode}
        autoConnect={false}
      >
        {/* Header */}
        <header className="flex items-center justify-between px-4 py-2 border-b border-border bg-card">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-foreground">Film Director</h1>
            <span className="text-xs text-muted-foreground px-2 py-0.5 bg-muted rounded hidden sm:inline-block">
              LiveCore Demo
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Fullscreen toggle */}
            <Button
              size="sm"
              variant="ghost"
              onClick={toggleFullscreen}
              className="gap-1.5"
            >
              {isFullscreen ? (
                <>
                  <Minimize2 className="w-4 h-4" />
                  <span className="hidden sm:inline">Exit Fullscreen</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-4 h-4" />
                  <span className="hidden sm:inline">Fullscreen</span>
                </>
              )}
            </Button>

            {/* Logo */}
            <Image
              src="/logo/symbol-night.svg"
              alt="Reactor Logo"
              width={36}
              height={24}
              className="opacity-90 dark:hidden"
            />
            <Image
              src="/logo/symbol-white.svg"
              alt="Reactor Logo"
              width={36}
              height={24}
              className="opacity-90 hidden dark:block"
            />
          </div>
        </header>

        {/* Main content */}
        <main className={`${isFullscreen ? "h-[calc(100vh-49px)] flex flex-col" : "p-4 md:p-6"}`}>
          <div className={`${isFullscreen ? "flex-1 flex flex-col min-h-0" : "max-w-6xl mx-auto space-y-4"}`}>
            {/* Connection panel - above the content */}
            {!isFullscreen && (
              <ConnectionPanel
                onJwtTokenChange={setJwtToken}
                onLocalModeChange={setIsLocalMode}
              />
            )}

            {/* Film Director */}
            <div className={`${
              isFullscreen 
                ? "flex-1 min-h-0" 
                : "bg-card rounded-lg border border-border overflow-hidden"
            }`}>
              <FilmDirector 
                maxFrames={MAX_FRAMES} 
                className={isFullscreen ? "h-full" : "h-[70vh] min-h-[500px]"} 
              />
            </div>
          </div>
        </main>
      </ReactorProvider>
    </div>
  );
}
