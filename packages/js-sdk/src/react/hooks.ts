import { useReactorStore } from "./ReactorProvider";
import type { ReactorStore } from "../core/store";
import type { MessageChannel } from "../types";
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
 * Hook for handling message subscriptions with proper React lifecycle management.
 *
 * The handler receives the message payload and the channel it arrived on:
 *   - "application" for model-defined messages (via get_ctx().send())
 *   - "runtime" for platform-level messages (e.g., capabilities response)
 *
 * @param handler - The message handler function (message, channel)
 */
export function useReactorMessage(
  handler: (message: any, channel: MessageChannel) => void
): void {
  const reactor = useReactor((state) => state.internal.reactor);
  const handlerRef = useRef(handler);

  // Update the ref when handler changes
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    console.debug("[useReactorMessage] Setting up message subscription");

    // Create a stable handler that calls the current ref
    const stableHandler = (message: any, channel: MessageChannel) => {
      console.debug("[useReactorMessage] Message received", {
        message,
        channel,
      });
      handlerRef.current(message, channel);
    };

    // Register the handler and get the cleanup function
    reactor.on("newMessage", stableHandler);

    console.debug("[useReactorMessage] Message handler registered");

    // Return the cleanup function
    return () => {
      console.debug("[useReactorMessage] Cleaning up message subscription");
      reactor.off("newMessage", stableHandler);
    };
  }, [reactor]);
}
