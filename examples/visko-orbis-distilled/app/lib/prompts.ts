// Curated scenes for the Visko Orbis Distilled demo.
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
// Distilled rewards, measured):
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
  // Text-only scenes (rendered as presets in PromptComposer)
  // ────────────────────────────────────────────────────────────────
  {
    id: "crimson-coast",
    label: "Crimson Coast",
    initial: {
      title: "Golden Hour Swell",
      text: "A dramatic coastline of black volcanic cliffs at golden hour, huge dark waves rolling in from a blood-orange sea and exploding into white foam against the rocks. Wind tears the spray off the wave crests and blows it inland in long streamers. The camera flies slowly along the cliff line close to the water, hugging the coast as the sun sinks lower and the sky deepens through crimson to violet. Cinematic, elemental, photorealistic — continuous slow aerial motion, no cuts, a single unbroken take.",
    },
    evolutions: [
      {
        title: "Storm Builds",
        text: "The same black volcanic coastline, the same slow aerial camera hugging the cliffs just above the water. The sunset is gone — towering charcoal storm clouds now swallow the sky, the waves grow massive and dark, rain begins to streak horizontally through the frame, and white spray blows hard off every crest. Lightning flickers deep inside the cloud mass over the sea. Elemental, dangerous, photorealistic — continuous slow aerial motion, no cuts, a single unbroken take.",
      },
      {
        title: "Night Break",
        text: "The same black volcanic coastline, the same slow aerial camera close to the water. Night has fallen — the sky is deep violet-black and full of stars, the waves roll in as dark masses edged with faint phosphorescent foam that glows where it breaks on the rocks. All is quiet and slow. Continuous slow aerial motion, no cuts, a single unbroken take.",
      },
    ],
  },
  {
    id: "sand-sea",
    label: "Sand Sea",
    initial: {
      title: "Drifting Dunes",
      text: "An immense desert of golden dunes drifting slowly under a flat white midday sky, their crests smoking with wind-blown sand. The camera glides low over the dune field in one long unbroken move, the ridgelines rising and falling like waves, fine dust streaming off every crest side-lit by the harsh sun. Heat shimmer ripples the distant horizon. Cinematic, hypnotic, photorealistic — continuous slow low glide, no cuts, a single unbroken take.",
    },
    evolutions: [
      {
        title: "Sandstorm Rising",
        text: "The same golden dune field, the same low gliding camera. A vast sandstorm wall is advancing across the desert — an orange-brown front filling half the sky, sand streaming thick over every crest, the light turning copper and dim, visibility dropping as the leading edge swallows the far dunes. Relentless, dramatic, photorealistic — continuous slow low glide, no cuts, a single unbroken take.",
      },
      {
        title: "Blue Night",
        text: "The same golden dune field, the same low gliding camera, now under a deep blue star-dense night sky. The dunes glow faintly blue-white along their crests, whole slopes cast in soft silver moonlight, the wind dropped to stillness. Slow, serene, photorealistic — continuous slow low glide, no cuts, a single unbroken take.",
      },
    ],
  },

  // ────────────────────────────────────────────────────────────────
  // Image-backed scenes (rendered as example cards in ImageStarter)
  // ────────────────────────────────────────────────────────────────
  {
    id: "sky-citadel",
    label: "Sky Citadel",
    imageUrl: "/images/sky-citadel.jpg",
    initial: {
      title: "Above the Clouds",
      text: "A majestic citadel of pale stone and slender spires floats serenely above an endless ocean of billowing cloud, its banners streaming in the high wind. A slow cinematic aerial drift circles the fortress as golden light breaks across the towers and glints off distant flying buttresses. Wisps of cloud stream beneath the citadel, waterfalls spill from its edges and dissolve into mist. Vast depth, painterly atmosphere, volumetric god-rays, epic fantasy matte-painting style brought to life. Continuous slow aerial motion, no cuts, a single unbroken take.",
    },
    evolutions: [
      {
        title: "Storm Rolls In",
        text: "The same floating stone citadel above the cloud ocean, the same slow aerial circling drift. A vast thunderstorm is rolling in — towering charcoal clouds swallow the horizon, lightning flickers inside the cloud mass below, wind whips the banners hard and tears the waterfall mist sideways, the remaining golden light turns cold and pale against the coming dark. Ominous, majestic, a single unbroken take.",
      },
      {
        title: "Night Lanterns",
        text: "The same floating stone citadel, the same slow aerial circling drift, now at deep blue night. Hundreds of warm amber lanterns glow from its windows and spires, a crescent moon and bright stars overhead, thin silver moonlight tracing the cloud ocean below. Calm and dreamlike, a single unbroken take.",
      },
    ],
  },
  {
    id: "neon-city",
    label: "Neon Rain",
    imageUrl: "/images/neon-city.jpg",
    initial: {
      title: "Into the Glow",
      text: "A rain-soaked neon city street at night, dense with glowing signs in pink, cyan and violet, their reflections smearing across wet asphalt. Crowds drift past with translucent umbrellas, steam rises from food stalls, and light rain streaks through the glow. The camera pushes slowly forward at eye level, deep into the canyon of light. Cinematic photorealism, anamorphic lens flare, moody noir atmosphere, constant gentle motion in every layer of the frame. A single unbroken take.",
    },
    evolutions: [
      {
        title: "Downpour",
        text: "The same neon-lit street at night, the same slow forward push at eye level, now in a torrential downpour — rain hammers the pavement and sheets off awnings, neon reflections shatter and dance in the rushing water, pedestrians hurry under shelter, distant lightning washes the whole canyon white for a heartbeat. Dense, kinetic, cinematic realism, a single unbroken take.",
      },
      {
        title: "Rain Stops, Dawn",
        text: "The same neon-lit street, the same slow forward push at eye level, as the rain fades to a drizzle and stops — the neon signs dim one by one as a pale blue dawn rises behind the towers, puddles settle into perfect mirrors, the street empties, quiet and still. Hopeful, cinematic, a single unbroken take.",
      },
    ],
  },
  {
    id: "coral-abyss",
    label: "Coral Abyss",
    imageUrl: "/images/coral-abyss.jpg",
    initial: {
      title: "The Drop-Off",
      text: "A coral reef at the edge of a vast underwater drop-off, columns of sunlight falling through deep blue water, schools of silver fish turning as one above anemones and fan corals. The camera glides slowly forward along the reef wall and out over the abyss, where the blue deepens to indigo and faint rays of light dissolve below. Particles drift through the light columns. Serene, majestic, photorealistic underwater cinematography with gentle continuous motion. A single unbroken take.",
    },
    evolutions: [
      {
        title: "Feeding Frenzy",
        text: "The same coral reef drop-off, the same slow glide along the wall, as a dense feeding frenzy erupts — thousands of silver fish boil and swirl in tight flashing bait balls above the corals, larger shadowy hunters dart through from the deep blue, scales scatter light in every direction. Fast and electrifying, but the reef stays the same place. A single unbroken take.",
      },
      {
        title: "Sunset From Below",
        text: "The same coral reef drop-off, the same slow glide along the wall, as the sun sets above the surface — the light columns tilt and turn deep gold then amber, the fish slow and settle into the corals, long shadows stretch across the reef wall, the water darkens toward night. Slow, warm, peaceful. A single unbroken take.",
      },
    ],
  },
  {
    id: "desert-ruins",
    label: "Desert Ruins",
    imageUrl: "/images/desert-ruins.jpg",
    initial: {
      title: "The Fallen Court",
      text: "Ancient colossal ruins half-buried in golden desert dunes, carved sandstone columns and a fallen colossus worn smooth by millennia of wind. Heat shimmers above the sand, fine dust streams off the crests of the dunes, and long late-afternoon shadows rake across the broken temple court. The camera moves in a slow, low dolly across the ruins, parallaxing the great stones against the distant dunes. Epic, sun-baked, painterly realism with drifting sand in every shaft of light. A single unbroken take.",
    },
    evolutions: [
      {
        title: "Sandstorm",
        text: "The same ancient desert ruins, the same slow low dolly, now inside a rising sandstorm — a wall of orange haze advances over the dunes, sand streams over the fallen colossus in thick waves, the sun dims to a pale disc, visibility drops as the wind roars through the columns. Dramatic, relentless, a single unbroken take.",
      },
      {
        title: "Blue Night",
        text: "The same ancient desert ruins, the same slow low dolly, under a deep blue star-dense night sky — cool moonlight edges the columns silver, the dunes glow faintly blue-white, thin mist pools in the temple court, absolute stillness. Mysterious and serene, a single unbroken take.",
      },
    ],
  },
];

/** Text-only scenes — used as "Try a prompt" presets in setup. */
export const TEXT_SCENES: ReadonlyArray<Scene> = SCENES.filter(
  (s) => !s.imageUrl,
);

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
