"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ConnectionState, RemoteTrack, Room, RoomEvent } from "livekit-client";

import { Header } from "./components/Header";
import { Player } from "./components/Player";
import { Chat, type ChatEntry } from "./components/Chat";

/**
 * The viewer: joins the show's LiveKit room (subscribe-only for media),
 * plays the broadcast, and carries the chat over the room's data channel.
 *
 * Chat rides the `show.chat` topic as JSON `{"author", "text"}` packets.
 * Everything a viewer types is an episode idea: the streamer reads the same
 * topic, expands the idea into scenes, and answers in the same chat (as the
 * author "show") — queued, at capacity, now playing, render failed. There
 * is no history: you see the room from the moment you joined.
 *
 * The LiveKit client resumes transient drops on its own; when it gives up,
 * this component re-fetches a token and rejoins in a loop, so leaving the
 * tab open through a streamer restart just works.
 */

const CHAT_TOPIC = "show.chat";
const RECONNECT_DELAY_MS = 3_000;
const CHAT_LIMIT = 200;

type Status = "connecting" | "live" | "offline";

export function ShowApp() {
  const [status, setStatus] = useState<Status>("connecting");
  const [videoTrack, setVideoTrack] = useState<RemoteTrack | null>(null);
  const [audioTrack, setAudioTrack] = useState<RemoteTrack | null>(null);
  const [chat, setChat] = useState<ChatEntry[]>([]);
  const roomRef = useRef<Room | null>(null);
  const nextId = useRef(0);

  const appendChat = useCallback((author: string, text: string) => {
    nextId.current += 1;
    const entry: ChatEntry = { id: nextId.current, author, text };
    setChat((prev) => [...prev.slice(-CHAT_LIMIT), entry]);
  }, []);

  useEffect(() => {
    let disposed = false;
    let room: Room | null = null;

    async function join(): Promise<void> {
      while (!disposed) {
        try {
          const response = await fetch("/api/livekit/token", {
            cache: "no-store",
          });
          if (!response.ok) throw new Error(`token: ${response.status}`);
          const { url, token } = (await response.json()) as {
            url: string;
            token: string;
          };

          room = new Room({ adaptiveStream: true });
          roomRef.current = room;
          room.on(RoomEvent.TrackSubscribed, (track) => {
            if (track.kind === "video") setVideoTrack(track);
            if (track.kind === "audio") setAudioTrack(track);
          });
          room.on(RoomEvent.TrackUnsubscribed, (track) => {
            if (track.kind === "video") setVideoTrack(null);
            if (track.kind === "audio") setAudioTrack(null);
          });
          room.on(
            RoomEvent.DataReceived,
            (payload, _participant, _kind, topic) => {
              if (topic !== CHAT_TOPIC) return;
              try {
                const message = JSON.parse(
                  new TextDecoder().decode(payload),
                ) as {
                  author?: string;
                  text?: string;
                };
                const author = String(message.author ?? "").slice(0, 32);
                const text = String(message.text ?? "").slice(0, 500);
                if (author && text) appendChat(author, text);
              } catch {
                // Not a chat packet; ignore.
              }
            },
          );
          room.on(RoomEvent.ConnectionStateChanged, (state) => {
            if (state === ConnectionState.Connected) setStatus("live");
          });
          room.on(RoomEvent.Disconnected, () => {
            setStatus("offline");
            setVideoTrack(null);
            setAudioTrack(null);
            if (!disposed) setTimeout(() => void join(), RECONNECT_DELAY_MS);
          });

          await room.connect(url, token);
          setStatus("live");
          return;
        } catch (error) {
          console.error("room join failed:", error);
          setStatus("offline");
          await new Promise((resolve) =>
            setTimeout(resolve, RECONNECT_DELAY_MS),
          );
        }
      }
    }

    void join();
    return () => {
      disposed = true;
      roomRef.current = null;
      void room?.disconnect();
    };
  }, [appendChat]);

  const sendChat = useCallback(
    (author: string, text: string) => {
      const room = roomRef.current;
      if (!room || room.state !== ConnectionState.Connected) return false;
      const packet = new TextEncoder().encode(JSON.stringify({ author, text }));
      room.localParticipant
        .publishData(packet, { reliable: true, topic: CHAT_TOPIC })
        .catch((error) => console.error("chat send failed:", error));
      // The sender does not receive its own data packet; echo locally.
      appendChat(author, text);
      return true;
    },
    [appendChat],
  );

  return (
    <main className="mx-auto flex h-dvh w-full max-w-4xl flex-col gap-4 p-4 lg:p-6">
      <Header status={status} />
      <Player videoTrack={videoTrack} audioTrack={audioTrack} status={status} />
      <Chat entries={chat} onSend={sendChat} connected={status === "live"} />
    </main>
  );
}
