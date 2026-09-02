export function SetupRequired() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="max-w-lg rounded-xl border border-zinc-800 bg-zinc-900/60 p-8">
        <h1 className="text-lg font-semibold">Almost there</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          This example mints session tokens server-side, so it needs your
          Reactor API key. Copy{" "}
          <code className="font-mono text-zinc-200">.env.example</code> to{" "}
          <code className="font-mono text-zinc-200">.env.local</code> and set:
        </p>
        <pre className="mt-3 rounded-md bg-zinc-950 p-3 font-mono text-sm text-zinc-300">
          REACTOR_API_KEY=rk_...
        </pre>
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          Get a key at{" "}
          <a
            className="text-brand underline"
            href="https://www.reactor.inc/account/api-keys"
          >
            reactor.inc/account/api-keys
          </a>
          , then restart{" "}
          <code className="font-mono text-zinc-200">pnpm dev</code>. Optionally
          add an <code className="font-mono text-zinc-200">OPENAI_API_KEY</code>{" "}
          to write episode scenes with AI.
        </p>
      </div>
    </main>
  );
}
