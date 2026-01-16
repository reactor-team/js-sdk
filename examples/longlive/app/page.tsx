"use client";

import { useState } from "react";
import { ReactorProvider, ReactorView } from "@reactor-team/js-sdk";
import { Header } from "@/components/Header";
import { ApiKeyInput } from "@/components/ApiKeyInput";
import { ReactorStatus } from "@/components/ReactorStatus";
import { LongLiveController } from "@/components/LongLiveController";

export default function Home() {
  const [jwtToken, setJwtToken] = useState<string | undefined>(undefined);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 p-4 sm:p-6">
      <div className="w-full max-w-3xl mx-auto flex flex-col gap-4">
        <Header />
        <ApiKeyInput onJwtTokenChange={setJwtToken} />

        <ReactorProvider
          modelName="longlive"
          jwtToken={jwtToken}
          autoConnect={false}
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
