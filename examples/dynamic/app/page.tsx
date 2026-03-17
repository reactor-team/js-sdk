"use client";

import { useState } from "react";
import {
  ReactorProvider,
  ReactorView,
  ReactorController,
} from "@reactor-team/js-sdk";
import { Header } from "@/components/Header";
import { Settings } from "@/components/Settings";
import { ReactorStatus } from "@/components/ReactorStatus";
import { ENDPOINTS } from "@/lib/endpoints";

export default function Home() {
  const [modelName, setModelName] = useState("longlive");
  const [isLocal, setIsLocal] = useState(true);
  const [apiUrl, setCoordinatorUrl] = useState(ENDPOINTS[0].url);
  const [jwtToken, setJwtToken] = useState<string | undefined>(undefined);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 p-4 sm:p-6">
      <div className="w-full max-w-3xl mx-auto flex flex-col gap-4">
        <Header />

        <Settings
          modelName={modelName}
          onModelNameChange={setModelName}
          isLocal={isLocal}
          onLocalChange={setIsLocal}
          onJwtTokenChange={setJwtToken}
          apiUrl={apiUrl}
          onApiUrlChange={setCoordinatorUrl}
        />

        <ReactorProvider
          modelName={modelName}
          apiUrl={isLocal ? undefined : apiUrl}
          local={isLocal}
          jwtToken={jwtToken}
          connectOptions={{ autoConnect: false }}
        >
          <div className="flex flex-col gap-3">
            <ReactorView className="w-full aspect-video bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl border border-gray-700/50 shadow-xl overflow-hidden" />
            <ReactorStatus />
            <ReactorController className="bg-white rounded-xl p-2" />
          </div>
        </ReactorProvider>
      </div>
    </div>
  );
}
