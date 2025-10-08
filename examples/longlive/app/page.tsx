"use client";

import { ReactorProvider, ReactorView } from "@reactor-team/js-sdk";
import { LongLiveController } from "@/components/LongLiveController";
import { ReactorStatus } from "@/components/ReactorStatus";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 p-4 sm:p-6 flex flex-col">
      <div className="max-w-5xl mx-auto flex flex-col gap-3 flex-1">
        <div className="text-center space-y-3 pt-8 pb-2">
          <h1 className="text-4xl sm:text-5xl font-bold leading-tight">
            <span className="text-gray-400 font-light">Reactor</span>
            <span className="text-white"> LongLive</span>
          </h1>
          <p className="text-gray-300 text-sm sm:text-base font-light tracking-wide">
            Real-time AI Video Generation
          </p>
        </div>
        <ReactorProvider
          modelName="longlive"
          insecureApiKey={process.env.NEXT_PUBLIC_REACTOR_API_KEY!}
        >
          <div className="flex flex-col gap-3">
            <ReactorView className="w-full aspect-video bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl border border-gray-700/50 shadow-xl overflow-hidden" />
            <ReactorStatus />
            <LongLiveController />
          </div>
        </ReactorProvider>
      </div>

      {/* Footer */}
      <footer className="max-w-5xl mx-auto w-full mt-8 pt-6 pb-4 border-t border-gray-800/50">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 text-xs text-gray-500">
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
            <span>© 2025 Reactor Technologies, Inc.</span>
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
              href="https://reactor-technologies.readme.io"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-300 transition-colors"
            >
              Documentation
            </a>
          </div>
          <a
            href="https://github.com/reactor-team/js-sdk"
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs px-3 py-1 bg-gray-800/50 rounded border border-gray-700/50 hover:border-gray-600 hover:bg-gray-800 transition-colors"
          >
            View on GitHub →
          </a>
        </div>
      </footer>
    </div>
  );
}
