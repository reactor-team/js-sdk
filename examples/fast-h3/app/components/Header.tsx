export function Header() {
  return (
    <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3 lg:px-6">
      <div>
        <h1 className="text-base font-semibold tracking-tight">
          FastH3 Episodes
        </h1>
        <p className="text-xs text-zinc-500">
          Compose a multi-scene episode; chained scenes play as one continuous
          video.
        </p>
      </div>
      <span className="rounded-full bg-brand px-3 py-1 font-mono text-xs text-brand-fg">
        Reactor
      </span>
    </header>
  );
}
