export interface StoryPrompt {
  id: string;
  title: string;
  prompt: string;
}

export interface Story {
  id: string;
  title: string;
  description: string;
  theme: string;
  startPrompt: StoryPrompt;
  followUps: StoryPrompt[];
}

export const stories: Story[] = [
  {
    id: "fantasy-quest",
    title: "Epic Fantasy Quest",
    description: "Journey through magical realms",
    theme: "from-purple-900 to-pink-900",
    startPrompt: {
      id: "fantasy-1",
      title: "Misty Temple",
      prompt:
        "Ancient stone temple entrance with towering archway covered in moss, morning mist swirling around crumbling pillars, golden sunlight filtering through, camera slowly moving forward through the ethereal atmosphere",
    },
    followUps: [
      {
        id: "fantasy-2",
        title: "Dragon Arrives",
        prompt:
          "Same ancient temple entrance, a majestic dragon with shimmering purple scales descends from above and lands gracefully in front of the archway, its massive wings folding, mist swirling more intensely around its powerful form",
      },
      {
        id: "fantasy-3",
        title: "Crystal Appears",
        prompt:
          "The dragon at the temple entrance lowers its head, and a massive glowing crystal materializes in the center of the archway behind it, pulsing with ethereal blue light, mystical runes on the pillars beginning to glow in response",
      },
      {
        id: "fantasy-4",
        title: "Magic Awakens",
        prompt:
          "The glowing crystal pulses intensely, sending waves of magical energy outward, the dragon spreads its wings as floating particles of light swirl around the temple entrance, the mystical runes now blazing bright, atmosphere charged with power",
      },
      {
        id: "fantasy-5",
        title: "Power Unleashed",
        prompt:
          "The crystal explodes in a burst of brilliant light, magical energy cascading through the temple archway, the dragon roars majestically, wings fully spread, embers and light particles filling the air, the entire scene transformed into a spectacular display of magic and power",
      },
    ],
  },
  {
    id: "cyberpunk-city",
    title: "Cyberpunk Metropolis",
    description: "Navigate the neon-lit future",
    theme: "from-cyan-900 to-blue-900",
    startPrompt: {
      id: "cyber-1",
      title: "Neon Rain",
      prompt:
        "Rain-soaked cyberpunk street at night, empty and quiet, neon signs glowing in blue and pink reflecting off wet pavement, holographic billboards flickering with advertisements, gentle rain falling, camera slowly moving down the deserted street",
    },
    followUps: [
      {
        id: "cyber-2",
        title: "Figure Appears",
        prompt:
          "Same rain-soaked street, a lone figure in a dark coat emerges from the shadows and walks slowly down the center of the street, neon reflections dancing across their silhouette, rain continuing to fall around them, atmosphere tense and moody",
      },
      {
        id: "cyber-3",
        title: "Drones Descend",
        prompt:
          "The figure stops walking and looks up, multiple holographic drones with red scanning lights descend from above, circling around the figure in the neon-lit street, rain intensifying, the atmosphere becoming more charged and threatening",
      },
      {
        id: "cyber-4",
        title: "Power Surge",
        prompt:
          "The figure raises their hand and neon energy crackles from their palm, the drones' lights flicker wildly, holographic billboards glitch and pulse erratically, electricity arcing through the rain, the street lighting up with electric blue energy",
      },
      {
        id: "cyber-5",
        title: "Digital Storm",
        prompt:
          "Massive surge of energy explodes from the figure, drones spinning out of control, all neon signs and holograms flickering rapidly in a cascade of colors, digital rain effect with matrix code falling everywhere, the entire street scene erupting in a spectacular cyberpunk light show",
      },
    ],
  },
  {
    id: "ocean-depths",
    title: "Ocean Depths",
    description: "Explore underwater wonders",
    theme: "from-blue-900 to-teal-900",
    startPrompt: {
      id: "ocean-1",
      title: "Blue Depths",
      prompt:
        "Floating in calm turquoise ocean water, shafts of golden sunlight penetrating from above creating dancing light patterns, small bubbles drifting upward, peaceful and serene underwater atmosphere, camera gently swaying with the current",
    },
    followUps: [
      {
        id: "ocean-2",
        title: "Life Emerges",
        prompt:
          "Same underwater view, schools of colorful tropical fish swim into frame from all directions, a sea turtle glides gracefully past the camera, the sunlight rays illuminating their vibrant colors, the scene coming alive with marine life",
      },
      {
        id: "ocean-3",
        title: "Coral Blooms",
        prompt:
          "The fish continue swimming as vibrant coral formations rise up from below into view, swaying sea plants appear, anemones open up, the underwater scene transforming into a colorful reef ecosystem, sea turtle still visible in the background",
      },
      {
        id: "ocean-4",
        title: "Giant Approaches",
        prompt:
          "The coral reef scene darkens slightly as a massive shadow passes overhead, a majestic whale shark slowly glides into view above the coral and fish, its enormous form creating an awe-inspiring presence, rays of sunlight silhouetting its massive body",
      },
      {
        id: "ocean-5",
        title: "Ocean Majesty",
        prompt:
          "The whale shark swims closer revealing intricate spotted patterns on its body, more marine life swarms around it including manta rays and dolphins, the entire underwater scene now a spectacular display of ocean biodiversity, sunlight creating a magical atmosphere through the clear water",
      },
    ],
  },
];
