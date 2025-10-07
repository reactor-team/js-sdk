"use client";

import {
  ReactorProvider,
  ReactorView
} from "@reactor-team/js-sdk";
import { LongLiveController } from "@/components/LongLiveController";
import { ReactorStatus } from "@/components/ReactorStatus";

export default function Home() {
  return (
    <div className="min-h-screen bg-black p-8">
      <div className="max-w-6xl mx-auto flex flex-col gap-4">
        <h1 className="text-white text-3xl font-bold text-center">Longlive</h1>
        <ReactorProvider
          modelName="longlive"
          autoConnect={true}
          coordinatorUrl={process.env.NEXT_PUBLIC_COORDINATOR_URL!}
          insecureApiKey={process.env.NEXT_PUBLIC_REACTOR_API_KEY!}
        >
          <div className="flex flex-col gap-4">
            <ReactorView className="w-full aspect-video bg-gray-900 rounded-lg border border-gray-600" />
            <ReactorStatus />
            <LongLiveController />
          </div>
        </ReactorProvider>
      </div>
    </div>
  );
}
