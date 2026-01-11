"use client";

import { useState } from "react";
import { ReactorProvider, ReactorView } from "@reactor-team/js-sdk";
import { Header } from "@/components/Header";
import { ApiKeyInput } from "@/components/ApiKeyInput";
import { ReactorStatus } from "@/components/ReactorStatus";
import { MatrixController } from "@/components/MatrixController";
import { ImageUploader } from "@/components/ImageUploader";

export default function Home() {
  const [jwtToken, setJwtToken] = useState<string | undefined>(undefined);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 p-4 sm:p-6">
      <div className="w-full max-w-3xl mx-auto flex flex-col gap-4">
        <Header />
        <ApiKeyInput onJwtTokenChange={setJwtToken} />

        <ReactorProvider modelName="matrix-2" jwtToken={jwtToken} autoConnect>
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
