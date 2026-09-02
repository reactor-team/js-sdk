// The metadata tag this app writes on every enqueued scene. The model never
// reads metadata; it echoes it back untouched on every message that
// references the clip — which is how the queue panel and the now-playing
// panel know what a clip *is* without keeping local state a reconnect
// could lose.

export interface EpisodeTag {
  episode: string; // random id grouping one episode's scenes
  title: string;
  scene: number; // 1-based
  scenes: number; // total in the episode
}

export function makeTag(tag: EpisodeTag): string {
  return JSON.stringify(tag);
}

export function parseTag(metadata: string): EpisodeTag | null {
  try {
    const tag = JSON.parse(metadata) as Partial<EpisodeTag>;
    if (typeof tag !== "object" || tag === null || !tag.episode) return null;
    return {
      episode: String(tag.episode),
      title: String(tag.title ?? ""),
      scene: Number(tag.scene ?? 0),
      scenes: Number(tag.scenes ?? 0),
    };
  } catch {
    return null;
  }
}
