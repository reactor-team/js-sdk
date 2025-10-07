"use client";

import { ReactorProvider, ReactorView } from "@reactor-team/js-sdk";
import { ReactorStatus } from "@/components/ReactorStatus";
import { MatrixController } from "@/components/MatrixController";
import { ImageUploader } from "@/components/ImageUploader";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 p-4 sm:p-6">
      <div className="max-w-5xl mx-auto flex flex-col gap-3">
        <div className="text-center space-y-1 pt-2">
          <div className="flex items-center justify-center gap-2">
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-300 leading-tight">
              Reactor - Matrix-2 Model
            </h1>
          </div>
          <p className="text-gray-400 text-xs">
            Real-time Interactive World Model
          </p>
        </div>
        <ReactorProvider
          modelName="matrix-2"
          autoConnect={true}
          coordinatorUrl={process.env.NEXT_PUBLIC_COORDINATOR_URL!}
          insecureApiKey={process.env.NEXT_PUBLIC_REACTOR_API_KEY!}
        >
          <div className="flex flex-col gap-3">
            <ReactorView className="w-full aspect-video bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl border border-gray-700/50 shadow-xl overflow-hidden" />
            <ReactorStatus />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <MatrixController />
              <ImageUploader />
            </div>
          </div>
        </ReactorProvider>
      </div>
    </div>
  );
}
