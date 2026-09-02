export function SetupRequired() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="max-w-lg rounded-xl border border-zinc-800 bg-zinc-900/60 p-8">
        <h1 className="text-lg font-semibold">Almost there</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          The viewer needs your LiveKit project credentials so it can mint room
          tokens. Copy{" "}
          <code className="font-mono text-zinc-200">.env.example</code> to{" "}
          <code className="font-mono text-zinc-200">.env.local</code> and set:
        </p>
        <ul className="mt-3 list-disc pl-5 font-mono text-sm text-zinc-300">
          <li>LIVEKIT_URL</li>
          <li>LIVEKIT_API_KEY</li>
          <li>LIVEKIT_API_SECRET</li>
          <li>LIVEKIT_ROOM (must match the streamer&apos;s)</li>
        </ul>
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          Then restart <code className="font-mono text-zinc-200">pnpm dev</code>
          . The streamer half of this example (see{" "}
          <code className="font-mono text-zinc-200">../streamer</code>) uses the
          same LiveKit project and publishes the broadcast the page plays.
        </p>
      </div>
    </main>
  );
}
