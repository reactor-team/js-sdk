import { StoreApi } from "zustand";
import type { ReactorStatus, ReactorError } from "../types";
import { Reactor, type Options as ReactorOptions } from "./Reactor";
import { create } from "zustand/react";
import { createContext } from "react";

export type ReactorStoreApi = ReturnType<typeof createReactorStore>;

export interface ReactorState {
  status: ReactorStatus;
  videoTrack: MediaStreamTrack | null;
  lastError?: ReactorError;
  sessionId?: string;
  sessionExpiration?: number;
  insecureApiKey?: string;
  jwtToken?: string;
}

export interface ReactorActions {
  sendCommand(command: string, data: any): Promise<void>;
  connect(jwtToken?: string): Promise<void>;
  disconnect(recoverable?: boolean): Promise<void>;
  publishVideoStream(stream: MediaStream): Promise<void>;
  unpublishVideoStream(): Promise<void>;
  reconnect(): Promise<void>;
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
//  - not putting the anything in the props, and then calling connect() passing as arguments the auth information.
// When in the first case, the auth information is saved in the STATE. Then, when you call connect() without arguments, the actual auth information is fetched
// from that STATE. In the second case, you pass the auth information directly into the function in the Reactor core.
export const defaultInitState: ReactorState = {
  status: "disconnected",
  videoTrack: null,
  lastError: undefined,
  sessionExpiration: undefined,
  insecureApiKey: undefined,
  jwtToken: undefined,
  sessionId: undefined,
};

export interface ReactorInitializationProps extends ReactorOptions {
  jwtToken?: string;
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
    coordinatorUrl: initProps.coordinatorUrl,
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
      set({ status: newStatus });
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

    reactor.on("streamChanged", (videoTrack: MediaStreamTrack | null) => {
      console.debug("[ReactorStore] Stream changed", {
        hasVideoTrack: !!videoTrack,
        videoTrackKind: videoTrack?.kind,
        videoTrackId: videoTrack?.id,
      });
      set({ videoTrack: videoTrack });
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

        // Simply register the handler
        get().internal.reactor.on("newMessage", handler);

        // Return a cleanup function that can be called to unregister
        return () => {
          console.debug("[ReactorStore] Cleaning up message handler");
          get().internal.reactor.off("newMessage", handler);
        };
      },
      sendCommand: async (command: string, data: any) => {
        console.debug("[ReactorStore] Sending command", { command, data });
        try {
          await get().internal.reactor.sendCommand(command, data);
          console.debug("[ReactorStore] Command sent successfully");
        } catch (error) {
          console.error("[ReactorStore] Failed to send command:", error);
          throw error;
        }
      },
      connect: async (jwtToken?: string) => {
        if (jwtToken === undefined) {
          // If no JWT Token, it might have been passed in the constructor props. So read from it.
          jwtToken = get().jwtToken;
        }

        console.debug("[ReactorStore] Connect called.");

        try {
          await get().internal.reactor.connect(jwtToken);
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
      publishVideoStream: async (stream: MediaStream) => {
        console.debug("[ReactorStore] Publishing video stream");

        try {
          await get().internal.reactor.publishTrack(stream.getVideoTracks()[0]);
          console.debug("[ReactorStore] Video stream published successfully");
        } catch (error) {
          console.error(
            "[ReactorStore] Failed to publish video stream:",
            error
          );
          throw error;
        }
      },
      unpublishVideoStream: async () => {
        console.debug("[ReactorStore] Unpublishing video stream");

        try {
          await get().internal.reactor.unpublishTrack();
          console.debug("[ReactorStore] Video stream unpublished successfully");
        } catch (error) {
          console.error(
            "[ReactorStore] Failed to unpublish video stream:",
            error
          );
          throw error;
        }
      },
      reconnect: async () => {
        console.debug("[ReactorStore] Reconnecting");
        try {
          await get().internal.reactor.reconnect();
          console.debug("[ReactorStore] Reconnect completed successfully");
        } catch (error) {
          console.error("[ReactorStore] Failed to reconnect:", error);
          throw error;
        }
      },
    };
  });
};
