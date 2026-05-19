// Copyright (c) 2024-2026 Reactor Technologies, Inc.
// SPDX-License-Identifier: Apache-2.0

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
interface ReactorProviderProps extends ReactorInitializationProps {
  connectOptions?: ReactorConnectOptions;
  jwtToken?: string;
  children?: ReactNode;
}

// tsx component
export function ReactorProvider({
  children,
  connectOptions,
  jwtToken,
  ...props
}: ReactorProviderProps) {
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
        jwtToken,
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
        jwtToken
      ) {
        console.debug(
          "[ReactorProvider] Starting autoconnect in first render..."
        );
        current
          .getState()
          .connect(jwtToken, pollingOptions)
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
        jwtToken,
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
      jwtToken
    ) {
      console.debug("[ReactorProvider] Starting autoconnect...");
      current
        .getState()
        .connect(jwtToken, pollingOptions)
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
  }, [apiUrl, modelName, autoConnect, local, jwtToken, maxAttempts]);

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
