"use client";

export function Header({
  status,
}: {
  status: "connecting" | "live" | "offline";
}) {
  const badge = {
    connecting: { label: "connecting", className: "bg-zinc-800 text-zinc-400" },
    live: { label: "live", className: "bg-active/20 text-active" },
    offline: {
      label: "offline — retrying",
      className: "bg-zinc-800 text-zinc-500",
    },
  }[status];
  return (
    <header className="flex items-center justify-between">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">FastH3 Show</h1>
        <p className="text-xs text-zinc-500">
          An always-on AI show. Type an idea in chat to pitch the next episode.
        </p>
      </div>
      <span
        className={`rounded-full px-3 py-1 font-mono text-xs ${badge.className}`}
      >
        {badge.label}
      </span>
    </header>
  );
}
