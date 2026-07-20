"use client";

// The fixed shell: header on top, control sidebar beside the content screen —
// the layout every Reactor example uses, and it never changes shape. Nothing
// here navigates or goes full screen: useWorldSession() reduces the SDK's
// authoritative snapshot to one AppView (lib/view.ts) and the two regions
// switch what they show off it, so the page always mirrors the session's
// state machine. The provider mounts at the root so even the browse view can
// show live session state (the sidebar's StatusBadge); nothing connects until
// you hit Connect or pick a world.

import { Header } from "@/components/Header";
import { LiveClientProvider } from "@/components/happy-oyster/ho-client";
import { useWorldSession } from "@/components/happy-oyster/use-world-session";
import { Sidebar } from "@/components/happy-oyster/Sidebar";
import { Screen } from "@/components/happy-oyster/Screen";

export function HappyOysterApp() {
  return (
    <LiveClientProvider>
      <Shell />
    </LiveClientProvider>
  );
}

function Shell() {
  const session = useWorldSession();
  return (
    <div className="flex h-dvh flex-col bg-zinc-950">
      <Header />
      <main className="flex w-full min-h-0 flex-1 flex-col gap-4 p-4 max-lg:overflow-y-auto sm:p-6 lg:flex-row lg:gap-6">
        <Sidebar session={session} />
        <Screen session={session} />
      </main>
    </div>
  );
}
