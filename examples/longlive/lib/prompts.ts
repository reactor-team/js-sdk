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
        title: "Knights Arrive",
        prompt:
          "A group of armored knights in silver plate armor charges into frame from both sides of the temple entrance, their metal pauldrons and breastplates gleaming, red and blue banners on their backs, swords raised and shields up as they run across the moss-covered stone courtyard toward the purple dragon standing before the ancient archway, its iridescent scales shimmering in the diffused morning light, mist parting around the knights as they advance, camera pulling back to capture the confrontation",
      },
      {
        id: "fantasy-4",
        title: "Dragon's Breath",
        prompt:
          "At the ancient temple entrance with towering stone archway, the majestic purple dragon standing before the entrance with shimmering iridescent scales glowing in the diffused morning light rears its head back, opens its massive jaws, and unleashes a powerful stream of fire directly toward the charging armored knights in silver plate armor with red and blue banners. The flames illuminate the dragon's purple scales and massive folded wings as fire sweeps across the moss-covered stone courtyard. The knights scatter in different directions, raising their shields against the flames. Orange and red light reflects off their metal pauldrons and breastplates. Mist swirls intensely around the scene, mixing with smoke and embers. The crumbling stone pillars and archway glow with firelight. Camera holds steady capturing the full confrontation.",
      },
      {
        id: "fantasy-5",
        title: "Majestic Dominance",
        prompt:
          "At the ancient temple entrance with towering stone archway, the majestic purple dragon with shimmering iridescent scales closes its massive jaws, ending the stream of fire, and slowly unfurls its enormous wings wide, stretching them to full span in a powerful display of dominance. The dragon's purple scales gleam brilliantly in the orange and red glow of lingering flames and embers scattered across the moss-covered stone courtyard. The armored knights in silver plate armor with red and blue banners have retreated to the edges of the courtyard, kneeling in submission with shields lowered and swords pointed down. Smoke and mist swirl dramatically around the dragon's powerful form and spread wings. The crumbling stone pillars and archway continue to glow with firelight. Embers drift upward through the morning air. The dragon stands victorious before the temple entrance. Camera pulls back slowly to capture the full majestic scene.",
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
        "Rain-soaked cyberpunk street at night, empty and quiet, steady rain falling, creating a gentle mist in the air. Wet pavement glistens with reflections of neon signs glowing in blue and pink. Holographic billboards flicker with advertisements, casting colorful light through the light rainfall. Small puddles dot the street surface, reflecting the neon glow. Atmosphere moody and atmospheric. Camera slowly moving forward down the deserted street. Medium shot.",
    },
    followUps: [
      {
        id: "cyber-2",
        title: "Figure Appears",
        prompt:
          "The same rain-soaked cyberpunk street at night with steady rain falling, creating a gentle mist. A lone figure in a dark coat emerges from the shadows and walks slowly down the center of the street, rain falling softly around them. Neon reflections in blue and pink shimmer across their silhouette and the wet pavement. Holographic billboards continue flickering with advertisements. Small puddles reflect the colorful lights. Atmosphere tense and moody. Camera slowly moving forward down the street. Medium shot.",
      },
      {
        id: "cyber-3",
        title: "Drones Descend",
        prompt:
          "The same rain-soaked cyberpunk street at night with steady rainfall. The dark-coated figure stops walking and looks up as multiple holographic drones with red scanning lights descend from above, circling around the figure. Rain continues falling steadily, creating atmospheric mist. Neon signs in blue and pink continue glowing, their reflections shimmering on the wet pavement. Holographic billboards flicker. The atmosphere becoming more charged and threatening. Camera slowly moving forward. Medium shot.",
      },
      {
        id: "cyber-4",
        title: "Power Surge",
        prompt:
          "On the rain-soaked cyberpunk street with steady rain falling, the dark-coated figure raises their hand and neon energy crackles from their palm toward the circling holographic drones. The drones' red scanning lights flickering wildly as they circle. Nearby holographic billboards glitching and pulsing. Electricity arcing through the rain with visible blue sparks. Blue and pink neon reflections dancing across the wet pavement. Rain continues steadily, creating atmospheric mist. Camera slowly moving forward toward the figure. Medium shot.",
      },
      {
        id: "cyber-5",
        title: "Drones Explode",
        prompt:
          "On the rain-soaked cyberpunk street with steady rain continuing to fall, the electric blue energy from the dark-coated figure's raised hand strikes the circling holographic drones one by one. The first drone explodes in a burst of bright orange and blue sparks, its red scanning lights going dark as it detonates. The second drone explodes with a flash of light, debris scattering through the air. The third and fourth drones detonate in sequence, each explosion sending shockwaves rippling through the rain and puddles. Flames and electrical arcs erupt from each exploding drone as burning drone fragments spiral down, crashing onto the wet street around the figure with violent splashes, small fires igniting on the pavement from the drone wreckage. The figure remains standing dramatically in the center of the street, hand still raised, silhouetted against the drone explosions. Smoke and embers from the destroyed drones mix with the falling rain. Neon signs and holographic billboards in blue and pink flicker intensely from the drone explosion shockwaves, their reflections dancing wildly across the wet pavement. The atmosphere explosive and victorious. Camera slowly moving forward toward the figure surrounded by burning drone debris and dissipating smoke. Medium shot.",
      },
      {
        id: "cyber-6",
        title: "Calm After Storm",
        prompt:
          "The rain-soaked cyberpunk street at night returns to calm, steady rain falling peacefully. The dark-coated figure lowers their hand, standing alone in the center of the empty street. No more electric blue energy crackling from their palm. Broken and shattered drone parts lie scattered across the wet pavement around the figure, their red scanning lights completely dark and unlit, no glow remaining. Wisps of smoke rise from the destroyed drone wreckage, slowly dissipating in the rain. The small fires on the pavement have been extinguished by the rainfall. Neon signs in blue and pink glow steadily once more, their calm reflections shimmering on the wet street. Holographic billboards flicker normally with advertisements. Puddles reflect the neon lights peacefully. The atmosphere quiet, victorious, and resolved. Camera slowly moving forward toward the figure standing among the lifeless drone debris. Medium shot.",
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
      title: "Empty Reef",
      prompt:
        "Underwater scene in crystal-clear turquoise ocean water above a quiet, empty coral reef. Shafts of golden sunlight penetrate from the surface above, creating dancing light patterns that shimmer and ripple across the white sandy bottom. The reef features scattered coral formations in shades of purple, orange, and pink, gently swaying with the current. Small bubbles drift lazily upward through the water column. Fine particles of sand rest undisturbed on the ocean floor. The scene is peaceful and empty with no marine life visible. The camera floats motionless in the water. Medium shot to wide shot.",
    },
    followUps: [
      {
        id: "ocean-2",
        title: "First Visitors",
        prompt:
          "The same underwater scene in crystal-clear turquoise ocean water above the coral reef. Shafts of golden sunlight continue penetrating from above, creating dancing light patterns across the white sandy bottom. A school of small yellow tropical fish swims into frame from the left, moving slowly between the purple, orange, and pink coral formations. A green sea turtle glides gracefully into view from the right side, its flippers moving in slow, deliberate strokes as it swims across the reef. Small bubbles continue drifting upward. The white sandy bottom and swaying coral remain unchanged. The camera floats motionless. Medium shot to wide shot.",
      },
      {
        id: "ocean-3",
        title: "Reef Awakens",
        prompt:
          "The same underwater scene in crystal-clear turquoise ocean water with the yellow tropical fish swimming between coral formations and the green sea turtle gliding smoothly through the frame. Shafts of golden sunlight continue creating dancing light patterns across the white sandy bottom. More marine life appears—bright orange clownfish dart among the corals, a blue parrotfish swims past, and striped angelfish weave through the scene. The purple, orange, and pink coral formations seem more vibrant and alive. Bright red and green anemones with gently waving tentacles emerge among the reef. Long strands of swaying kelp and sea plants appear, flowing with the current. Small bubbles drift upward. The camera floats motionless. Medium shot to wide shot.",
      },
      {
        id: "ocean-4",
        title: "Human Arrival",
        prompt:
          "The same underwater scene in crystal-clear turquoise ocean water with yellow tropical fish, orange clownfish, blue parrotfish, striped angelfish swimming among the purple, orange, and pink coral formations, red and green anemones, and swaying kelp. The green sea turtle continues gliding through the frame. Shafts of golden sunlight continue creating dancing light patterns across the white sandy bottom. A scuba diver in a black wetsuit with blue trim and silver oxygen tank enters the frame from above, descending slowly into view. Large streams of bubbles rise from the diver's regulator, floating upward through the shafts of sunlight. The diver's fins move gently as they drift downward toward the reef. The fish continue swimming undisturbed. The camera floats motionless. Medium shot to wide shot.",
      },
    ],
  },
];
