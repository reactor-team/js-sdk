"use client";

import {
  ReactorProvider,
  ReactorView
} from "@reactor-team/js-sdk";
import { ReactorStatus } from "@/components/ReactorStatus";
import { MatrixController } from "@/components/MatrixController";
import { ImageUploader } from "@/components/ImageUploader";

export default function Home() {
  return (
    <div className="h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 p-3 overflow-hidden">
      <div className="max-w-6xl mx-auto flex flex-col gap-2 h-full">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-300">Reactor - Matrix 2 Model</h1>
          <p className="text-gray-400 text-xs">Real-time Interactive World Model</p>
        </div>
        <ReactorProvider
          modelName="matrix-2"
          autoConnect={true}
          coordinatorUrl={process.env.NEXT_PUBLIC_COORDINATOR_URL!}
          insecureApiKey={process.env.NEXT_PUBLIC_REACTOR_API_KEY!}
        >
          <div className="flex flex-col gap-2 flex-1 min-h-0">
            <ReactorView className="flex-1 min-h-0 bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg border border-gray-700/50 shadow-xl overflow-hidden" />
            <ReactorStatus className="flex-shrink-0" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 flex-shrink-0">
              <MatrixController />
              <ImageUploader />
            </div>
          </div>
        </ReactorProvider>
      </div>
    </div>
  );
}
