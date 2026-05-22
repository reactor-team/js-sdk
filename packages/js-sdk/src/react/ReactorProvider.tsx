"use client";

import { ReactNode, useContext, useEffect, useRef, useState } from "react";
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
   * Static JWT token. Use this when you already hold a long-lived
   * SDK JWT (e.g. minted via `/tokens`) and don't need refresh.
   *
   * For short-lived tokens (Clerk session JWTs default to ~60s,
   * custom backends with sub-minute TTLs, etc.) use {@link getJwt}
   * instead — passing a stale string here will make every
   * Coordinator HTTP hop 401 once the token expires. See REA-2512.
   */
  jwtToken?: string;
  /**
   * Lazy JWT resolver. The SDK calls this immediately before each
   * Coordinator HTTP request so a fresh token is always on the
   * wire. Preferred over {@link jwtToken} for short-lived auth
   * flows. If both are provided, `getJwt` wins.
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
  // Reconcile the two token-shape props down to a single
  // JwtSource for the store. `getJwt` wins when both are supplied
  // — the resolver subsumes the static form.
  const jwtSource: JwtSource | undefined = getJwt ?? jwtToken;

  // Stable Reactor instance
  const storeRef = useRef<ReactorStoreApi | undefined>(undefined);
  const firstRender = useRef(true);
  // State to trigger re-renders when store changes
  const [_storeVersion, setStoreVersion] = useState(0);

  if (storeRef.current === undefined) {
    console.debug("[ReactorProvider] Creating new reactor store");
    // We create the store without autoconnecting, to avoid duplicate connections.
    // We actually connect when the component is mounted, to be on sync with the react component lifecycle.
    storeRef.current = createReactorStore(
      initReactorStore({
        ...props,
        jwtToken: jwtSource,
      })
    );
    console.debug("[ReactorProvider] Reactor store created successfully");
  }

  // Destructure connectOptions with defaults
  const { autoConnect = false, ...pollingOptions } = connectOptions ?? {};

  const { apiUrl, modelName, local } = props;
  const maxAttempts = pollingOptions.maxAttempts;

  // Handle page unload (refresh, close, navigate away) with non-recoverable disconnect
  useEffect(() => {
    const handleBeforeUnload = () => {
      console.debug(
        "[ReactorProvider] Page unloading, performing non-recoverable disconnect"
      );
      // Call disconnect synchronously - we can't await here as the page is unloading
      // The disconnect(false) ensures non-recoverable cleanup (stops session, clears state)
      storeRef.current?.getState().internal.reactor.disconnect(false);
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
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
    // The effect intentionally keys on the unified `jwtSource`
    // identity so a getJwt resolver swap re-runs the provider tear
    // down/setup path the same way a string change would have.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUrl, modelName, autoConnect, local, jwtSource, maxAttempts]);

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
