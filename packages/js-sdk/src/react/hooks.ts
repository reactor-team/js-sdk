import { useReactorStore } from "./ReactorProvider";
import type { ReactorStore } from "../core/store";
import { useShallow } from "zustand/shallow";
import { useEffect, useRef } from "react";

/**
 * Generic hook for accessing selected parts of the Reactor store.
 *
 * @param selector - A function that selects part of the store state.
 * @returns The selected slice from the store.
 */
export function useReactor<T>(selector: (state: ReactorStore) => T): T {
  return useReactorStore(useShallow(selector));
}

/**
 * Hook for receiving model application messages.
 *
 * Only fires for messages sent by the model via `get_ctx().send()`.
 * Internal platform-level messages (e.g. capabilities) are NOT delivered here.
 *
 * @param handler - Callback invoked with each application message payload.
 */
export function useReactorMessage(handler: (message: any) => void): void {
  const reactor = useReactor((state) => state.internal.reactor);
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    const stableHandler = (message: any) => {
      handlerRef.current(message);
    };

    reactor.on("message", stableHandler);

    return () => {
      reactor.off("message", stableHandler);
    };
  }, [reactor]);
}

/**
 * Hook for receiving internal platform-level (runtime) messages.
 *
 * This is intended for advanced use cases that need access to the runtime
 * control layer, such as capabilities negotiation. Model application messages
 * sent via `get_ctx().send()` are NOT delivered through this hook — use
 * {@link useReactorMessage} for those.
 *
 * @param handler - Callback invoked with each runtime message payload.
 */
export function useReactorInternalMessage(
  handler: (message: any) => void
): void {
  const reactor = useReactor((state) => state.internal.reactor);
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    const stableHandler = (message: any) => {
      handlerRef.current(message);
    };

    reactor.on("runtimeMessage", stableHandler);

    return () => {
      reactor.off("runtimeMessage", stableHandler);
    };
  }, [reactor]);
}
