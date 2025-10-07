"use client";

import {
  ReactorProvider,
  ReactorView
} from "@reactor-team/js-sdk";
import { ReactorStatus } from "@/components/ReactorStatus";
import { MatrixController } from "@/components/MatrixController";

export default function Home() {
  return (
    <div className="min-h-screen bg-black p-8">
      <div className="max-w-6xl mx-auto flex flex-col gap-4">
        <h1 className="text-white text-3xl font-bold text-center">Matrix 2</h1>
        <ReactorProvider
          modelName="matrix-2"
          autoConnect={true}
          coordinatorUrl={process.env.NEXT_PUBLIC_COORDINATOR_URL!}
          insecureApiKey={process.env.NEXT_PUBLIC_REACTOR_API_KEY!}
        >
          <div className="flex flex-col gap-4">
            <ReactorView className="w-full aspect-video bg-gray-900 rounded-lg border border-gray-600" />
            <ReactorStatus />
            <MatrixController />
          </div>
        </ReactorProvider>
      </div>
    </div>
  );
}
