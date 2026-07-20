"use client";

// One client surface.
//
// Every screen in this app talks to `useHappyOysterClient()`, never to the SDK
// hook directly. <LiveClientProvider> mounts the real <HappyOysterProvider> and
// adapts useHappyOyster() onto the surface below, rendering the live world into
// <HappyOysterVideo>.
//
// The surface is deliberately the shape of the SDK facade, so the adapter is a
// thin forwarding layer that keeps the SDK hook isolated to this file.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  HappyOysterProvider,
  HappyOysterVideo,
  useHappyOyster,
  useHappyOysterTravelStatus,
} from "@reactor-models/happy-oyster/react";
import type {
  AdventureCommand,
  CreateWorldParams,
  HappyOysterMode,
  HappyOysterPhase,
  TravelStateMessage,
  WorldStateMessage,
} from "@reactor-models/happy-oyster";

export interface HappyOysterClient {
  phase: HappyOysterPhase;
  worldState: WorldStateMessage | null;
  travelState: TravelStateMessage | null;
  streaming: boolean;
  travelStatus: string;
  /** The last connect failure, humanized — cleared on the next attempt. */
  lastError: string | null;
  /** Open the Reactor session and sync the first world snapshot. */
  connect: () => Promise<void>;
  createWorld: (params: CreateWorldParams) => Promise<unknown>;
  attachWorld: (encryptedWorldId: string) => Promise<unknown>;
  startTravel: () => Promise<{ streaming: boolean }>;
  endTravelSession: () => Promise<void>;
  disconnect: () => Promise<void>;
  hold: (command: AdventureCommand) => Promise<void>;
  interact: (verb: string) => Promise<void>;
  release: (axes: {
    translation?: true;
    rotation?: true;
    interaction?: true;
  }) => Promise<void>;
  stop: () => Promise<void>;
  instruct: (content: string) => Promise<{ accepted: boolean }>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  rewind: (rewindToSec: number) => Promise<{ resumedAtSec: number }>;
}

interface ClientContextValue {
  client: HappyOysterClient;
  videoSlot: ReactNode;
}

const ClientContext = createContext<ClientContextValue | null>(null);

export function useHappyOysterClient(): HappyOysterClient {
  const ctx = useContext(ClientContext);
  if (!ctx) {
    throw new Error(
      "useHappyOysterClient must be used within a client provider",
    );
  }
  return ctx.client;
}

export function useVideoSlot(): ReactNode {
  const ctx = useContext(ClientContext);
  if (!ctx)
    throw new Error("useVideoSlot must be used within a client provider");
  return ctx.videoSlot;
}

// ── live ─────────────────────────────────────────────────────────────────────

// Local mode talks to a model served by the Reactor runtime on your own host
// (adventure on :8080, director on :8081), skipping the Coordinator: connect()
// takes no JWT and there is no /tokens exchange. `local` lets the SDK pick the
// right per-mode port; an explicit NEXT_PUBLIC_COORDINATOR_URL always wins.
const LOCAL_RUNTIME = process.env.NEXT_PUBLIC_HO_LOCAL_RUNTIME === "1";
const COORDINATOR_URL = process.env.NEXT_PUBLIC_COORDINATOR_URL;

// The Reactor connection options, minus the mode the provider is mounted with.
const providerOptions = LOCAL_RUNTIME
  ? { local: true, ...(COORDINATOR_URL ? { apiUrl: COORDINATOR_URL } : {}) }
  : { apiUrl: COORDINATOR_URL ?? "https://api.reactor.inc" };

// JWT resolver: the SDK calls it on every Coordinator HTTP hop, so a short-lived
// token can't age out mid-session. The route caches the token, so most calls
// come back from the browser's HTTP cache without hitting the server.
async function fetchToken(): Promise<string> {
  const r = await fetch("/api/reactor/token");
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Token fetch failed: ${r.status}`);
  }
  const { jwt } = (await r.json()) as { jwt: string };
  return jwt;
}

// The mode is fixed for the life of the session — it picks which Reactor model
// (adventure or director) the session connects to — so the provider is mounted
// (and keyed) on it and switching experiences remounts a fresh session.
export function LiveClientProvider({
  mode,
  children,
}: {
  mode: HappyOysterMode;
  children: ReactNode;
}) {
  return (
    <HappyOysterProvider mode={mode} {...providerOptions}>
      <LiveClientBridge>{children}</LiveClientBridge>
    </HappyOysterProvider>
  );
}

// Session-level failures (no GPU capacity, bad key, network) belong next to
// the Connect button, not in the console. 429 is the one users actually hit:
// the Coordinator had no free GPU for the session.
function describeError(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  if (/\b429\b/.test(message))
    return "No GPU capacity available right now — try again in a moment.";
  return message;
}

function LiveClientBridge({ children }: { children: ReactNode }) {
  const ho = useHappyOyster();
  const [travelStatus, setTravelStatus] = useState("running");
  const [lastError, setLastError] = useState<string | null>(null);
  useHappyOysterTravelStatus(setTravelStatus);

  const connect = useCallback(() => {
    setLastError(null);
    return ho.connect(LOCAL_RUNTIME ? undefined : fetchToken).catch((cause) => {
      setLastError(describeError(cause));
      throw cause;
    });
  }, [ho]);

  const client = useMemo<HappyOysterClient>(
    () => ({
      phase: ho.phase,
      worldState: ho.worldState,
      travelState: ho.travelState,
      streaming: ho.streaming,
      travelStatus,
      lastError,
      connect,
      createWorld: ho.createWorld,
      attachWorld: ho.attachWorld,
      startTravel: ho.startTravel,
      endTravelSession: ho.endTravelSession,
      disconnect: ho.disconnect,
      hold: ho.hold,
      interact: ho.interact,
      release: ho.release,
      stop: ho.stop,
      instruct: ho.instruct,
      pause: ho.pause,
      resume: ho.resume,
      rewind: ho.rewind,
    }),
    [ho, travelStatus, lastError, connect],
  );

  const value = useMemo<ClientContextValue>(
    () => ({
      client,
      videoSlot: (
        <HappyOysterVideo className="absolute inset-0 h-full w-full object-contain" />
      ),
    }),
    [client],
  );

  return (
    <ClientContext.Provider value={value}>{children}</ClientContext.Provider>
  );
}
