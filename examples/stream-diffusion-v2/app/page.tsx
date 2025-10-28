"use client";

import { useState } from "react";
import {
  ReactorProvider,
  ReactorView,
  WebcamStream,
} from "@reactor-team/js-sdk";
import { StreamDiffusionController } from "@/components/StreamDiffusionController";
import { ReactorStatus } from "@/components/ReactorStatus";
import { OrientationGuard } from "@/components/OrientationGuard";
import { useMobileLandscape } from "@/hooks/useMobileLandscape";
import { CompactReactorStatus } from "@/components/CompactReactorStatus";
import { CompactStreamDiffusionController } from "@/components/CompactStreamDiffusionController";

export default function Home() {
  const isMobileLandscape = useMobileLandscape();
  const [showControls, setShowControls] = useState(false);

  return (
    <OrientationGuard>
      <ReactorProvider
        modelName="stream-diffusion-v2"
        insecureApiKey={process.env.NEXT_PUBLIC_REACTOR_API_KEY!}
        queueing
      >
        {isMobileLandscape ? (
          // Mobile Landscape Layout
          <div className="h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 overflow-hidden relative">
            {/* Fullscreen Video */}
            <div className="absolute inset-0">
              <ReactorView className="w-full h-full" videoObjectFit="cover" />
            </div>

            {/* Webcam Overlay */}
            <div className="absolute top-3 right-3 z-10">
              <WebcamStream
                className="w-24 aspect-video rounded border border-gray-700/70 overflow-hidden shadow-2xl"
                videoObjectFit="fill"
                videoConstraints={{
                  width: 672,
                  height: 384,
                }}
              />
            </div>

            {/* Hidden controller for auto-start logic */}
            <div className="hidden">
              <CompactStreamDiffusionController />
            </div>

            {/* Floating Settings Button */}
            <button
              onClick={() => setShowControls(true)}
              className="fixed bottom-4 right-4 z-20 w-12 h-12 bg-gray-800/90 hover:bg-gray-700 border border-gray-600/50 rounded-full flex items-center justify-center shadow-lg transition-all duration-200 backdrop-blur-sm"
              aria-label="Open settings"
            >
              <svg
                className="w-6 h-6 text-gray-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </button>

            {/* Controls Overlay */}
            {showControls && (
              <div
                className="fixed inset-0 z-30 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
                onClick={() => setShowControls(false)}
              >
                <div
                  className="bg-gray-900/95 border border-gray-700/50 rounded-lg shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Header with Close Button */}
                  <div className="sticky top-0 bg-gray-900/95 border-b border-gray-700/50 p-3 flex items-center justify-between backdrop-blur-sm">
                    <h2 className="text-lg font-bold text-white">
                      <span className="text-gray-400 font-light">Reactor</span>
                      <span> StreamDiffusionV2</span>
                    </h2>
                    <button
                      onClick={() => setShowControls(false)}
                      className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-800 transition-colors"
                      aria-label="Close settings"
                    >
                      <svg
                        className="w-5 h-5 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>

                  {/* Controls Content */}
                  <div className="p-3 space-y-3">
                    <CompactReactorStatus />
                    <CompactStreamDiffusionController />

                    {/* Footer */}
                    <div className="pt-3 border-t border-gray-800/50 text-center">
                      <p className="text-[10px] text-gray-500">
                        © {new Date().getFullYear()} Reactor
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          // Desktop Layout
          <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 p-4 sm:p-6 flex flex-col">
            <div className="w-full max-w-3xl md:min-w-[640px] lg:min-w-[768px] mx-auto flex flex-col gap-3 flex-1">
              <div className="text-center space-y-3 pt-8 pb-2">
                <h1 className="text-4xl sm:text-5xl font-bold leading-tight">
                  <span className="text-gray-400 font-light">Reactor</span>
                  <span className="text-white"> StreamDiffusionV2</span>
                </h1>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <p className="text-gray-300 text-sm font-light tracking-wide">
                    Real-time Video to Video AI
                  </p>
                  <a
                    href="https://github.com/reactor-team/js-sdk"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-gray-800/50 hover:bg-gray-700/50 text-gray-300 hover:text-white rounded border border-gray-700/50 hover:border-gray-600 transition-colors"
                  >
                    <svg
                      className="w-3 h-3"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                    </svg>
                    View on GitHub
                  </a>
                </div>
              </div>
              <div className="flex flex-col gap-3">
                <div className="relative aspect-video rounded-xl border border-gray-700/50 overflow-hidden">
                  <div className="absolute inset-0">
                    <ReactorView
                      className="w-full h-full"
                      videoObjectFit="cover"
                    />
                  </div>
                  <div className="absolute inset-0 pointer-events-none ">
                    <div className="absolute bottom-0 left-0 p-4">
                      <WebcamStream
                        className="w-1/4 aspect-video rounded-lg border border-gray-700/70 overflow-hidden shadow-2xl pointer-events-auto"
                        videoObjectFit="fill"
                        videoConstraints={{
                          width: 672,
                          height: 384,
                        }}
                      />
                    </div>
                  </div>
                </div>
                <ReactorStatus />
                <StreamDiffusionController />
              </div>
            </div>

            {/* Footer */}
            <footer className="w-full max-w-3xl md:min-w-[640px] lg:min-w-[768px] mx-auto mt-8 pt-6 pb-4 border-t border-gray-800/50">
              <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 text-xs text-gray-500">
                <span>
                  © {new Date().getFullYear()} Reactor Technologies, Inc.
                </span>
                <span className="hidden sm:inline">-</span>
                <a
                  href="https://reactor.inc"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-gray-300 transition-colors"
                >
                  reactor.inc
                </a>
                <span className="hidden sm:inline">-</span>
                <a
                  href="https://docs.reactor.inc/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-gray-300 transition-colors"
                >
                  Documentation
                </a>
              </div>
            </footer>
          </div>
        )}
      </ReactorProvider>
    </OrientationGuard>
  );
}
