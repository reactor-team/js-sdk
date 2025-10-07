"use client";

import { ReactorProvider, ReactorView } from "@reactor-team/js-sdk";
import { LongLiveController } from "@/components/LongLiveController";
import { ReactorStatus } from "@/components/ReactorStatus";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 p-4 sm:p-6">
      <div className="max-w-5xl mx-auto flex flex-col gap-3">
        <div className="text-center space-y-1 pt-2">
          <div className="flex items-center justify-center gap-2">
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-300 leading-tight">
              Reactor - LongLive Model
            </h1>
          </div>
          <p className="text-gray-400 text-xs">Real-time AI Video Generation</p>
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
    </div>
  );
}
