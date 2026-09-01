// Curated scenes for the Visko Orbis Stable demo.
//
// Each scene is a self-contained world: one `initial` prompt that
// starts the scene plus a small list of `evolutions` that continue or
// pivot it. The frontend uses the same list in two places:
//
//   - Setup phase (PromptComposer + ImageStarter) reads `initial` to
//     populate the "Try a prompt" presets and example image cards.
//   - Live phase (EvolveScene) matches the active `current_prompt`
//     against `initial` and `evolutions` to find which scene the
//     session belongs to, then renders that scene's evolutions as
//     hot-swap suggestions.
//
// WHY THE PROMPTS ARE WRITTEN THIS WAY (the two things Visko Orbis
// Stable rewards, measured):
//
//   1. CONTINUOUS STEERABLE SCENES. The model's hero feature is
//      PER-CHUNK prompting — `set_prompt` mid-run morphs the picture
//      into the new description at the next chunk boundary instead of
//      cutting. So each evolution shifts the world's CONDITIONS (time
//      of day, weather, light, motion) while re-establishing the same
//      setting and subject BEFORE the change. That continuity is what
//      lets the scene morph read as cinematography rather than a
//      glitch. One continuous take per prompt — never a cut.
//
//   2. IMAGE-ANCHORED OPENINGS. `set_image` pins the first chunk to a
//      reference frame and every later chunk inherits it through the
//      model's own history, so image-backed scenes hold their
//      composition far better than pure text starts. Most presets pair
//      a paragraph prompt with a cinematic reference frame.
//
// AUDIO — deliberately absent from every preset:
//
//   Measured guidance: feeding the scene description into
//   `set_audio_prompt` makes the audio WORSE than leaving it unset
//   (unset = the audio model generates sound from the picture alone).
//   Don't fill audio prompts in here.

export interface Prompt {
  /** Short headline used as the button label in the UI. */
  title: string;
  /** Full paragraph sent to the model. */
  text: string;
}

export interface Scene {
  id: string;
  label: string;
  initial: Prompt;
  evolutions: ReadonlyArray<Prompt>;
  /** Reference image URL. Present only on image-backed scenes. */
  imageUrl?: string;
}

export const SCENES: ReadonlyArray<Scene> = [
  // ────────────────────────────────────────────────────────────────
  // Text-only scenes were removed per launch direction — the example leads
  // with image-anchored runs. Free-form text entry still works the same way
  // (PromptComposer's own textarea) and maps exactly to what you see in
  // the Scene library: a T2V custom prompt is stored nowhere here, so it
  // simply acts as its own live scene from connect until reset.
  // ────────────────────────────────────────────────────────────────

  // ────────────────────────────────────────────────────────────────
  // Image-backed scenes (rendered as example cards in ImageStarter)
  // ────────────────────────────────────────────────────────────────
  {
    id: "underwater",
    label: "Underwater",
    imageUrl: "/images/underwater.jpg",
    initial: {
      title: "Facing the Reef",
      text: "The diver swims slowly forward above the reef as the camera tracks alongside him at eye level. Schools of tropical fish flow around and behind him while sunlight ripples through the water.",
    },
    evolutions: [
      {
        title: "Light Rays Intensify",
        text: "The same diver above the same reef, the same camera tracking alongside him at eye level. The cloud cover above the surface thins and the sun breaks through — the light ripples sharpen into strong visible beams angling down through the water, scales flash silver-blue as the schools turn through them. Serene, bright, a single unbroken take.",
      },
      {
        title: "Into Deeper Water",
        text: "The same diver, the same camera tracking alongside him at eye level, as the reef below falls away into deeper open water — the bright coral colors dim into colder blues, the fish grow sparser, the surface overhead stretches farther away. The diver keeps swimming steadily into the blue. Quiet, expansive, a single unbroken take.",
      },
    ],
  },
  {
    id: "rooftop-drummer",
    label: "Rooftop Drummer",
    imageUrl: "/images/drums.jpg",
    initial: {
      title: "Golden Hour Kit",
      text: "The drummer begins playing a steady, energetic rhythm, alternating between the snare and cymbal. The camera slowly pushes toward him as the cymbal vibrates and nearby pigeons take flight across the sunset skyline.",
    },
    evolutions: [
      {
        title: "Cymbal Solo",
        text: "The same rooftop, the same drummer, the same slow push from the camera toward him over the kit. He drops the snare entirely and leans into the cymbals for a solo — they vibrate harder and longer with every hit, catching the golden light in shimmering rings, more pigeons scatter upward past the lens in waves. Energetic, sun-flared, a single unbroken take.",
      },
      {
        title: "Sun Drops Behind the Skyline",
        text: "The same rooftop, the same drummer, the same slow push from the camera. The sun sinks fully behind the towers as he keeps playing — the sky burns down to deep orange then violet, the cymbal flashes catch the last light, the skyline windows start glowing one by one behind him. Warm, cinematic, a single unbroken take.",
      },
    ],
  },
  {
    id: "fisherman",
    label: "Fisherman",
    imageUrl: "/images/fisherman.jpg",
    initial: {
      title: "Wall of Water",
      text: "The fisherman grips the rail and braces himself as the boat rises over a towering wave. The camera rocks with the deck while rain and sea spray sweep across the frame.",
    },
    evolutions: [
      {
        title: "The Swell Breaks",
        text: "The same fisherman on the same boat, the same camera rocking with the deck. The towering wave peaks and crests over the bow — foam surges straight into the lens, the deck pitches hard down the backside of the swell, and the fisherman rides it out at the rail as another roller builds on the horizon. Visceral, relentless, a single unbroken take.",
      },
      {
        title: "Into the Squall's Heart",
        text: "The same fisherman on the same boat, the same camera rocking with the deck. The squall thickens around him — rain sheets near-horizontal across the gunwale, visibility collapses toward the bow, lightning flickers inside the cloud mass ahead, the next wave arrives almost unseen until spray explodes off the rail. Relentless, atmospheric, a single unbroken take.",
      },
    ],
  },
  {
    id: "greenhouse",
    label: "Greenhouse",
    imageUrl: "/images/greenhouse.jpg",
    initial: {
      title: "Along the Brick Path",
      text: "The botanist turns away from the camera and walks along the brick path toward the open greenhouse doors. The camera follows slowly behind her as nearby leaves sway and the sunlit fountain grows larger ahead.",
    },
    evolutions: [
      {
        title: "Through the Open Doors",
        text: "The same botanist, the same camera following slowly behind her along the brick path. She reaches the open greenhouse doors and steps through — inside, hanging plants sway in shafts of stained light, mist hangs over the fountain ahead, and her silhouette passes through the doorway as the camera follows her in. Quiet, sun-warmed, a single unbroken take.",
      },
      {
        title: "To the Fountain",
        text: "The same botanist, the same camera following slowly behind her inside the greenhouse. She walks straight to the fountain — water spills over its rim, wet leaves glisten in the low sun, and she reaches out to touch the hanging vines at its edge as the camera comes to rest just behind her. Calm, serene, a single unbroken take.",
      },
    ],
  },
];

/** Image-backed scenes — used as example cards in setup. */
export const IMAGE_SCENES: ReadonlyArray<Scene & { imageUrl: string }> =
  SCENES.filter((s): s is Scene & { imageUrl: string } => !!s.imageUrl);

/**
 * Look up which scene a given prompt belongs to. Returns the matching
 * scene if `prompt` is either the scene's `initial.text` or one of
 * its `evolutions[].text`; otherwise null (the user has typed a
 * custom prompt we don't have a curated continuation for).
 */
export function findSceneForPrompt(
  prompt: string | null | undefined,
): Scene | null {
  if (!prompt) return null;
  return (
    SCENES.find(
      (s) =>
        s.initial.text === prompt ||
        s.evolutions.some((e) => e.text === prompt),
    ) ?? null
  );
}
