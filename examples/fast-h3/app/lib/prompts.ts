// The curated content library: episode ideas for the AI writer, and one
// fully hand-written episode for running without an OPENAI_API_KEY.
//
// The hand-written scenes model the two rules that make chained episodes
// look right on fast-h3 (each scene's clip opens on the previous clip's
// final frame):
//
//   1. Every scene is fully self-contained — the model reads only that
//      scene's text, so setting, subjects, style, and light are re-described
//      verbatim in each one. Anything omitted mutates or vanishes.
//   2. Every scene after the first OPENS ON A HARD CUT to a new shot
//      (different camera angle, distance, or location), described from
//      scratch. A chain written as one continuous take compounds generation
//      errors scene over scene until the picture smears; the cut is what
//      keeps an episode sharp end to end.

export interface EpisodeIdea {
  title: string; // short label used on the preset button
  idea: string; // what gets sent to /api/upsample
}

export const EPISODE_IDEAS: ReadonlyArray<EpisodeIdea> = [
  {
    title: "The lighthouse whale",
    idea: "A lighthouse keeper discovers her lamp attracts a curious whale, and they become unlikely friends",
  },
  {
    title: "Robot bakery",
    idea: "A tiny old robot runs a bakery and races to finish a wedding cake while its parts keep falling off",
  },
  {
    title: "Cat sheriff showdown",
    idea: "A cartoon cat sheriff faces off against a gang of tumbleweeds that are stealing the town's hats",
  },
];

export interface WrittenEpisode {
  title: string;
  scenes: ReadonlyArray<string>;
}

// Load-ready without any LLM. Note how scene 2 and 3 each open with an
// explicit cut and still re-describe the world in full.
export const EXAMPLE_EPISODE: WrittenEpisode = {
  title: "The Clockmaker's Storm",
  scenes: [
    "A warm cluttered clockmaker's workshop at night, brass gears and pendulums covering every wall, amber lamplight, rain streaking the window. Elda, a small white-haired clockmaker in round glasses and a leather apron, leans over a half-built brass owl on her workbench, tightening a tiny screw. She whispers to it fondly: \"One more turn and you'll sing.\" Ticking clocks layered like rain, soft thunder outside, a gentle music-box melody.",
    "Hard cut to a wide shot outside the same clockmaker's shop at night: a crooked timber building on a cobbled street, its windows glowing amber against sheets of rain, a brass owl weathervane spinning on the roof. Lightning flashes over the rooftops as the storm swells and the shop sign swings on its chains. Same warm storybook look, rain-slicked cobbles reflecting the light. Rolling thunder, wind rattling shutters, the faint music-box melody drifting from inside.",
    'Hard cut to a close-up inside the workshop: the finished brass owl on the workbench opens its glowing amber eyes as Elda, the small white-haired clockmaker in round glasses and a leather apron, watches with delight in the warm lamplight, gears and pendulums lining the walls behind her. The owl unfolds its metal wings and sings three bright chiming notes. Elda laughs: "There you are!" Chiming birdsong, ticking clocks, thunder fading, the music-box melody resolving.',
  ],
};

export const MAX_SCENES = 6;
export const DEFAULT_SCENES = 3;
