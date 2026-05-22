import { StoreApi } from "zustand";
import type {
  ReactorStatus,
  ReactorError,
  MessageScope,
  ConnectOptions,
} from "../types";
import { type JwtSource } from "./auth";
import { Reactor, type Options as ReactorOptions } from "./Reactor";
import { FileRef } from "./FileRef";
import { create } from "zustand/react";
import { createContext } from "react";

export type ReactorStoreApi = ReturnType<typeof createReactorStore>;

export interface ReactorState {
  status: ReactorStatus;
  /**
   * Media tracks received from the model, keyed by track name.
   *
   * Each entry maps a recvonly track name (e.g. `"main_video"`,
   * `"main_audio"`) to the live `MediaStreamTrack` delivered by the model.
   */
  tracks: Record<string, MediaStreamTrack>;
  lastError?: ReactorError;
  sessionId?: string;
  sessionExpiration?: number;
  /**
   * Token source for Coordinator HTTP calls. Stored as the union so
   * callers that pass a resolver via `<ReactorProvider getJwt={…} />`
   * (the recommended path for short-lived tokens — REA-2512) and
   * legacy callers that pass a static string both flow through the
   * same field. Selecting `s.jwtToken` will return whichever shape
   * the consumer originally supplied.
   */
  jwtToken?: JwtSource;
}

export interface ReactorActions {
  sendCommand(command: string, data: any, scope?: MessageScope): Promise<void>;
  connect(jwtToken?: JwtSource, options?: ConnectOptions): Promise<void>;
  disconnect(recoverable?: boolean): Promise<void>;
  publish(name: string, track: MediaStreamTrack): Promise<void>;
  unpublish(name: string): Promise<void>;
  reconnect(options?: ConnectOptions): Promise<void>;
  uploadFile(file: File | Blob, options?: { name?: string }): Promise<FileRef>;
}

// Internal state not exposed to components
interface ReactorInternalState {
  reactor: Reactor;
}

export const ReactorContext = createContext<ReactorStoreApi | undefined>(
  undefined
);

export type ReactorStore = ReactorState &
  ReactorActions & {
    internal: ReactorInternalState;
  };

// We introduce two methods to perform authentication:
//  - putting the auth information inside of the ReactorProvider props, and then calling connect() without arguments.
//  - not putting anything in the props, and then calling connect() passing as arguments the auth information.
// When in the first case, the auth information is saved in the STATE. Then, when you call connect() without arguments,
// the actual auth information is fetched from that STATE.
// In the second case, you pass the auth information directly into the function in the Reactor core.
export const defaultInitState: ReactorState = {
  status: "disconnected",
  tracks: {},
  lastError: undefined,
  sessionExpiration: undefined,
  jwtToken: undefined,
  sessionId: undefined,
};

export interface ReactorInitializationProps extends ReactorOptions {
  /**
   * Token source for the underlying {@link Reactor}. See
   * {@link ReactorState.jwtToken}: prefer the resolver form when
   * the token is short-lived (REA-2512).
   */
  jwtToken?: JwtSource;
}

export const initReactorStore = (
  props: ReactorInitializationProps
): ReactorState & ReactorInitializationProps => {
  return {
    ...defaultInitState,
    // These are only used for dev initialization, not exposed in the store
    ...props,
  };
};

export const createReactorStore = (
  initProps: ReactorInitializationProps,
  publicState: ReactorState = defaultInitState
): StoreApi<ReactorStore> => {
  console.debug("[ReactorStore] Creating store", {
    apiUrl: initProps.apiUrl,
    jwtToken: initProps.jwtToken,
    initialState: publicState,
  });

  return create<ReactorStore>()((set, get) => {
    const reactor = new Reactor(initProps);

    console.debug("[ReactorStore] Setting up event listeners");

    reactor.on("statusChanged", (newStatus: ReactorStatus) => {
      console.debug("[ReactorStore] Status changed", {
        oldStatus: get().status,
        newStatus,
      });
      if (newStatus === "disconnected") {
        set({ status: newStatus, tracks: {} });
      } else {
        set({ status: newStatus });
      }
    });

    reactor.on(
      "sessionExpirationChanged",
      (newSessionExpiration: number | undefined) => {
        console.debug("[ReactorStore] Session expiration changed", {
          oldSessionExpiration: get().sessionExpiration,
          newSessionExpiration: newSessionExpiration,
        });
        set({ sessionExpiration: newSessionExpiration });
      }
    );

    reactor.on("trackReceived", (name: string, track: MediaStreamTrack) => {
      console.debug("[ReactorStore] Track received", {
        name,
        kind: track.kind,
        id: track.id,
      });
      set({ tracks: { ...get().tracks, [name]: track } });
    });

    reactor.on("error", (error: ReactorError) => {
      console.debug("[ReactorStore] Error occurred", error);
      set({ lastError: error });
    });

    reactor.on("sessionIdChanged", (newSessionId: string | undefined) => {
      console.debug("[ReactorStore] Session ID changed", {
        oldSessionId: get().sessionId,
        newSessionId: newSessionId,
      });
      set({ sessionId: newSessionId });
    });

    return {
      ...publicState,
      jwtToken: initProps.jwtToken,
      internal: { reactor },

      // actions
      onMessage: (handler: (message: any) => void) => {
        console.debug("[ReactorStore] Registering message handler");

        get().internal.reactor.on("message", handler);

        return () => {
          console.debug("[ReactorStore] Cleaning up message handler");
          get().internal.reactor.off("message", handler);
        };
      },
      sendCommand: async (command: string, data: any, scope?: MessageScope) => {
        console.debug("[ReactorStore] Sending command", {
          command,
          data,
          scope,
        });
        try {
          await get().internal.reactor.sendCommand(command, data, scope);
          console.debug("[ReactorStore] Command sent successfully");
        } catch (error) {
          console.error("[ReactorStore] Failed to send command:", error);
          throw error;
        }
      },
      connect: async (jwtToken?: JwtSource, options?: ConnectOptions) => {
        if (jwtToken === undefined) {
          // If no JWT Token, it might have been passed in the constructor props. So read from it.
          jwtToken = get().jwtToken;
        }

        console.debug("[ReactorStore] Connect called.");

        try {
          await get().internal.reactor.connect(jwtToken, options);
          console.debug("[ReactorStore] Connect completed successfully");
        } catch (error) {
          console.error("[ReactorStore] Connect failed:", error);
          throw error;
        }
      },
      disconnect: async (recoverable: boolean = false) => {
        console.debug("[ReactorStore] Disconnect called", {
          currentStatus: get().status,
        });

        try {
          await get().internal.reactor.disconnect(recoverable);
          console.debug("[ReactorStore] Disconnect completed successfully");
        } catch (error) {
          console.error("[ReactorStore] Disconnect failed:", error);
          throw error;
        }
      },
      publish: async (name: string, track: MediaStreamTrack) => {
        console.debug(`[ReactorStore] Publishing track "${name}"`);

        try {
          await get().internal.reactor.publishTrack(name, track);
          console.debug(
            `[ReactorStore] Track "${name}" published successfully`
          );
        } catch (error) {
          console.error(
            `[ReactorStore] Failed to publish track "${name}":`,
            error
          );
          throw error;
        }
      },
      unpublish: async (name: string) => {
        console.debug(`[ReactorStore] Unpublishing track "${name}"`);

        try {
          await get().internal.reactor.unpublishTrack(name);
          console.debug(
            `[ReactorStore] Track "${name}" unpublished successfully`
          );
        } catch (error) {
          console.error(
            `[ReactorStore] Failed to unpublish track "${name}":`,
            error
          );
          throw error;
        }
      },
      reconnect: async (options?: ConnectOptions) => {
        console.debug("[ReactorStore] Reconnecting");
        try {
          await get().internal.reactor.reconnect(options);
          console.debug("[ReactorStore] Reconnect completed successfully");
        } catch (error) {
          console.error("[ReactorStore] Failed to reconnect:", error);
          throw error;
        }
      },
      uploadFile: async (file: File | Blob, options?: { name?: string }) => {
        console.debug("[ReactorStore] Uploading file");
        try {
          const result = await get().internal.reactor.uploadFile(file, options);
          console.debug("[ReactorStore] File uploaded successfully", result);
          return result;
        } catch (error) {
          console.error("[ReactorStore] Failed to upload file:", error);
          throw error;
        }
      },
    };
  });
};
