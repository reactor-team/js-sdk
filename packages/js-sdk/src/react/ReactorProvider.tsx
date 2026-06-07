"use client";

import {
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createReactorStore,
  initReactorStore,
  ReactorContext,
  ReactorStore,
  ReactorStoreApi,
  type ReactorInitializationProps,
} from "../core/store";
import { useStore } from "zustand";
import type { ConnectOptions } from "../types";
import type { JwtResolver, JwtSource } from "../core/auth";

/**
 * Options for the React provider's connect behavior.
 * Extends the core ConnectOptions with autoConnect for the React lifecycle.
 */
export interface ReactorConnectOptions extends ConnectOptions {
  /** Whether to automatically connect when the provider mounts. Default: false. */
  autoConnect?: boolean;
}

// Provider props
//
// `children` is declared optional even though a render-less Provider
// makes no sense at runtime — React always supplies the slot via JSX
// (`<ReactorProvider>…</ReactorProvider>`) or the third positional
// argument to `createElement`, but @types/react's `createElement`
// overloads gate the *second* argument on the props type alone:
// when `children` is required, callers can't use the third-arg form
// even though it works fine at runtime. Relaxing to optional lets
// generated codegen output (and any other programmatic caller) pass
// children positionally without falling back to an
// `eslint-disable-next-line react/no-children-prop` workaround in
// downstream consumer projects.
interface ReactorProviderProps extends Omit<
  ReactorInitializationProps,
  "jwtToken"
> {
  connectOptions?: ReactorConnectOptions;
  /**
   * Static JWT token. Use when you hold a long-lived SDK JWT (e.g.
   * minted via `/tokens`). For short-lived tokens use {@link getJwt}.
   */
  jwtToken?: string;
  /**
   * Lazy JWT resolver invoked immediately before each Coordinator
   * HTTP request. Preferred for short-lived tokens. Wins over
   * {@link jwtToken} when both are provided.
   */
  getJwt?: JwtResolver;
  children?: ReactNode;
}

// tsx component
export function ReactorProvider({
  children,
  connectOptions,
  jwtToken,
  getJwt,
  ...props
}: ReactorProviderProps) {
  // Auto-stabilize the `getJwt` resolver via ref. Without this, an
  // inline `getJwt={async () => …}` on every parent render gives the
  // provider a new function identity, the effect below treats it
  // as "auth source changed", tears the store down, and disconnects
  // the live session — a footgun we'd otherwise be asking every
  // consumer to defuse with `useCallback`. Same idiom React's
  // `useEffectEvent` codifies, and what we already use internally
  // in `useClipDownload` / `ClipPlayer` to absorb resolver identity
  // churn there. The ref is read at request time so the latest
  // resolver — and any state it closes over (Clerk session, account
  // ID, etc.) — is on the wire for every Coordinator HTTP hop.
  const getJwtRef = useRef<JwtResolver | undefined>(getJwt);
  useEffect(() => {
    getJwtRef.current = getJwt;
  });
  // Only re-memoize when the resolver transitions between defined
  // and undefined (sign-in / sign-out). Pure identity changes are
  // absorbed by `getJwtRef`.
  const hasGetJwt = getJwt !== undefined;
  const stableGetJwt = useMemo<JwtResolver | undefined>(() => {
    if (!hasGetJwt) return undefined;
    return async () => {
      const r = getJwtRef.current;
      return r ? await r() : "";
    };
  }, [hasGetJwt]);

  // Static-string `jwtToken` keeps its legacy semantics: changing
  // the string identity means "different auth source" (e.g. tenant
  // switch) and intentionally tears the session down. Consumers who
  // need to rotate a short-lived token should use `getJwt` — which
  // is now both the recommended path and the foolproof one.
  const jwtSource: JwtSource | undefined = stableGetJwt ?? jwtToken;

  // Stable Reactor instance
  const storeRef = useRef<ReactorStoreApi | undefined>(undefined);
  const firstRender = useRef(true);
  // State to trigger re-renders when store changes
  const [_storeVersion, setStoreVersion] = useState(0);

  // Destructure connectOptions with defaults
  const { autoConnect = false, ...pollingOptions } = connectOptions ?? {};

  if (storeRef.current === undefined) {
    console.debug("[ReactorProvider] Creating new reactor store");
    // We create the store without autoconnecting, to avoid duplicate connections.
    // We actually connect when the component is mounted, to be on sync with the react component lifecycle.
    storeRef.current = createReactorStore(
      initReactorStore({
        ...props,
        jwtToken: jwtSource,
        connectOptions: pollingOptions,
      })
    );
    console.debug("[ReactorProvider] Reactor store created successfully");
  }

  const { apiUrl, modelName, local } = props;
  const maxAttempts = pollingOptions.maxAttempts;
  const { autoResumeTracks } = pollingOptions;

  // Keep connectOptions in the store in sync when provider props change without
  // tearing the store down (e.g. toggling autoResumeTracks while disconnected).
  useEffect(() => {
    storeRef.current?.setState({ connectOptions: pollingOptions });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoResumeTracks, maxAttempts]);

  // On page unload, perform a non-recoverable disconnect. The session's
  // creator tears the session down (DELETE), matching the pre-multi-connection
  // behaviour; a client that adopted an existing session (connect({ sessionId }))
  // only closes its own transport and leaves the session alive for its owner.
  // This gating lives in Reactor.disconnect() via the `createdSession` flag, so
  // passing `false` here is safe for both roles. We can't await during unload,
  // so the DELETE is best-effort (same as before).
  useEffect(() => {
    const handleBeforeUnload = () => {
      storeRef.current?.getState().internal.reactor.disconnect(false);
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;

      // We know as a fact that the store is not undefined at this point
      const current = storeRef.current!;
      if (
        autoConnect &&
        current.getState().status === "disconnected" &&
        jwtSource
      ) {
        console.debug(
          "[ReactorProvider] Starting autoconnect in first render..."
        );
        current
          .getState()
          .connect(jwtSource, pollingOptions)
          .then(() => {
            console.debug(
              "[ReactorProvider] Autoconnect successful in first render"
            );
          })
          .catch((error) => {
            console.error(
              "[ReactorProvider] Failed to autoconnect in first render:",
              error
            );
          });
      }
      return () => {
        console.debug(
          "[ReactorProvider] Disconnecting in cleanup for first render"
        );
        current
          .getState()
          .disconnect()
          .then(() => {
            console.debug(
              "[ReactorProvider] Disconnect completed successfully in cleanup for first render"
            );
          })
          .catch((error) => {
            console.error(
              "[ReactorProvider] Failed to disconnect in cleanup for first render:",
              error
            );
          });
      };
    }

    console.debug("[ReactorProvider] Updating reactor store");
    storeRef.current = createReactorStore(
      initReactorStore({
        apiUrl,
        modelName,
        local,
        jwtToken: jwtSource,
        connectOptions: pollingOptions,
      } satisfies ReactorInitializationProps)
    );

    // Store current reference to the store in the return
    const current = storeRef.current!;

    // Increment version to trigger re-render and propagate new store to Provider
    setStoreVersion((v) => v + 1);
    console.debug(
      "[ReactorProvider] Reactor store updated successfully, and increased version"
    );

    if (
      autoConnect &&
      current.getState().status === "disconnected" &&
      jwtSource
    ) {
      console.debug("[ReactorProvider] Starting autoconnect...");
      current
        .getState()
        .connect(jwtSource, pollingOptions)
        .then(() => {
          console.debug("[ReactorProvider] Autoconnect successful");
        })
        .catch((error) => {
          console.error("[ReactorProvider] Failed to autoconnect:", error);
        });
    }

    return () => {
      console.debug("[ReactorProvider] Disconnecting in cleanup");
      current
        .getState()
        .disconnect()
        .then(() => {
          console.debug(
            "[ReactorProvider] Disconnect completed successfully in cleanup"
          );
        })
        .catch((error) => {
          console.error("[ReactorProvider] Failed to disconnect:", error);
        });
    };
    // `autoConnect` is a first-mount-only signal and `maxAttempts`
    // is initial-handshake polling config; neither identifies the
    // session, so they're intentionally out of the deps to stop
    // mid-mount prop changes from tearing the live session down.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUrl, modelName, local, jwtSource]);

  return (
    <ReactorContext.Provider value={storeRef.current}>
      {children}
    </ReactorContext.Provider>
  );
}

export function useReactorStore<T = ReactorStore>(
  selector: (state: ReactorStore) => T
): T {
  const ctx = useContext(ReactorContext);
  if (!ctx) {
    throw new Error("useReactor must be used within a ReactorProvider");
  }

  return useStore(ctx, selector);
}
