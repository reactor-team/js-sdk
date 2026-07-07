// GENERATED from the Lingbot 2 lab case3 export (final_cases 07-06)
// by an import script — regenerate rather than hand-editing prompt text.
//
// One scene per distinct base prompt in the export (22), image = the
// case's exported first frame, prompt = its base prompt VERBATIM, and
// every action from the case's actions.json as a held event:
//
//   - `finalPrompt` present  → the lab's finished rewrite (`prompt_final:
//     true`, `prompt_en`), applied verbatim while held.
//   - `finalPrompt` absent   → `addendum` (the lab's `addendum_en`,
//     often Chinese) composed onto the base at press time.
//
// Slots map to hold keys (digits, F, G, O, Space); where the lab ships
// several candidates per slot (`f#0`, `f#1`, …) only the first gets the
// key — the rest are button-only. `lab-selected` comments mark actions
// the lab's own eval sessions had curated on. Labels/icons are ours;
// generic lab labels ("Key 1") were renamed from the addendum content.
//
// This is the full unpruned menu, imported for curation — delete the
// scenes and events that don't hold up.

import type { Scene } from "./scenes";

export const CASE3_SCENES: ReadonlyArray<Scene> = [
  {
    id: "dune_boarder",
    label: "Dune Boarder",
    description: "Third-person hooded figure snowboarding down a vast sand dune",
    imageUrl: "/images/dune_boarder.jpg",
    prompt:
      "This is a third-person-view video of a hooded figure snowboarding down a vast sand dune. Cinematic rendering style. The snowboarder remains at the exact centre of the frame at constant size and distance. Neither the snowboarder nor the camera moves on its own; arrow-key look-input is the only source of camera motion, orbiting around the stable snowboarder only while held. With no event key pressed, the snowboarder stands balanced on the board, arms relaxed at their sides, ready to carve.",
    events: [
      {
        id: "1_0",
        label: "Golden Surge",
        icon: "💨",
        key: "1",
        keyLabel: "1",
        addendum:
          "滑沙板突然疯狂加速向前冲，脚下爆发明亮的金色光芒，身后拖出一条发光的沙尘尾迹和更深的滑痕。",
      },
      {
        id: "2_0",
        label: "Mirage Waters",
        icon: "🪞",
        key: "2",
        keyLabel: "2",
        addendum:
          "前方沙地出现一条发光的蓝色水面倒影，像海市蜃楼一样铺在沙丘之间。",
      },
      {
        id: "3_0",
        label: "Magic Carpet",
        icon: "🧞",
        key: "3",
        keyLabel: "3",
        addendum:
          "滑沙板变成童话中的魔毯，穿灰色连帽衫的人站在魔毯上飞上天空，在沙丘上方平稳飘行。",
      },
      {
        id: "f_0",
        label: "Fluttering Moths",
        icon: "🐾",
        key: "f",
        keyLabel: "F",
        addendum:
          "The original focal subject remains the main subject, unchanged in pose and position, while a swarm of luminous moths flutters into view from the dune's crest, casting delicate, shifting shadows across the figure's grey robes as they trace shimmering, undulating paths through the still air.",
      },
      {
        id: "g_0",
        label: "Shifting Dunes",
        icon: "🌦️",
        key: "g",
        keyLabel: "G",
        addendum:
          "The vast dune landscape shifts as if sculpted by an invisible wind, the sand ripples sharpening into stark, rhythmic ridges that march forward while the sky bleeds into a twilight palette of deep indigo and soft amber.",
      },
    ],
  },
  {
    id: "ice_chair",
    label: "Office Chair on Ice",
    description: "Third-person office chair sliding fast across a frozen lake (Chinese base prompt)",
    imageUrl: "/images/ice_chair.jpg",
    prompt:
      "第三人称视角。扮演办公椅在冰面上向前高速滑行",
    events: [
      {  // lab-selected
        id: "1_0",
        label: "Aurora Below",
        icon: "🌌",
        key: "1",
        keyLabel: "1",
        addendum:
          "冰面下方亮起蓝绿色极光，像整片湖底在发光，椅子的影子被拖成长长的透明倒影。",
      },
      {  // lab-selected
        id: "2_0",
        label: "Curious Penguins",
        icon: "🐧",
        key: "2",
        keyLabel: "2",
        addendum:
          "远处出现几只企鹅，它们好奇地围着滑行的办公椅观看。",
      },
      {  // lab-selected
        id: "3_0",
        label: "Rocket Sled",
        icon: "🚀",
        key: "3",
        keyLabel: "3",
        addendum:
          "椅背后方喷出两道小小的蓝色火焰，整把椅子像火箭雪橇一样贴着冰面冲出去。",
      },
      {  // lab-selected
        id: "4_0",
        label: "Glass Racetrack",
        icon: "🏁",
        key: "4",
        keyLabel: "4",
        addendum:
          "冰面突然变成一条巨大的透明赛道，远处出现发光的弯道标线和漂浮的终点拱门。",
      },
      {
        id: "f_0",
        label: "Distant Puppies",
        icon: "🐾",
        key: "f",
        keyLabel: "F",
        addendum:
          "The original focal subject remains the main subject, unchanged in pose and position, while in the distant background, a group of playful puppies runs across the icy expanse, their paws kicking up small sprays of snow and ice as they chase each other.",
      },
      {
        id: "g_0",
        label: "Snowy Blizzard",
        icon: "🌦️",
        key: "g",
        keyLabel: "G",
        addendum:
          "A gentle snowfall begins, with snowflakes drifting down to accumulate on the black mesh backrest and the white floor, softening the landscape and creating a wintry atmosphere.",
      },
    ],
  },
  {
    id: "space_moped",
    label: "Space Moped",
    description: "Chase-cam astronaut riding a retro moped through the stars (Chinese base prompt)",
    imageUrl: "/images/space_moped.jpg",
    prompt:
      "第三人称追尾视角。扮演穿宇航服的人骑着红色复古小摩托，在银河星空中平稳向前飞行，车轮发出蓝色等离子光轨。",
    events: [
      {  // lab-selected
        id: "1_0",
        label: "Raised Fist",
        icon: "✊",
        key: "1",
        keyLabel: "1",
        addendum:
          "摩托车上的穿宇航服的人举起右拳。",
      },
      {  // lab-selected
        id: "2_0",
        label: "Throttle Up",
        icon: "💫",
        key: "2",
        keyLabel: "2",
        addendum:
          "小摩托轻轻加速，车尾的蓝色光轨变得更长更亮，周围星星缓慢向后流动。",
      },
      {  // lab-selected
        id: "3_0",
        label: "Space Whale",
        icon: "🐋",
        key: "3",
        keyLabel: "3",
        addendum:
          "远处出现一只巨大的发光太空鲸鱼，它在星空中缓慢游过，和小摩托保持距离。",
      },
      {  // lab-selected
        id: "4_0",
        label: "Blue Earth",
        icon: "🌍",
        key: "4",
        keyLabel: "4",
        addendum:
          "远处出现蓝色的地球，地球很大但保持在画面远方，缓慢从星空背景中显现。",
      },
      {  // lab-selected
        id: "5_0",
        label: "Wormhole Ahead",
        icon: "🕳️",
        key: "5",
        keyLabel: "5",
        addendum:
          "前方星空出现一个巨大的圆形虫洞，边缘发出紫色光芒，小摩托朝着虫洞方向继续飞行。",
      },
      {
        id: "f_0",
        label: "Cosmic Companion",
        icon: "🐾",
        key: "f",
        keyLabel: "F",
        addendum:
          "The astronaut remains the main subject, centered and unchanged in pose and position, while a small, fluffy alien kitten with shimmering fur materializes nearby, its paws playfully tapping the air and leaving tiny sparks.",
      },
      {
        id: "g_0",
        label: "Nebula Shift",
        icon: "🌦️",
        key: "g",
        keyLabel: "G",
        addendum:
          "The deep space backdrop shifts as vibrant nebulae clouds drift closer, painting the cosmic void with swirling hues of magenta and cyan, enhancing the ethereal glow of the plasma trail.",
      },
    ],
  },
  {
    id: "cloud_eagle",
    label: "Cloud Eagle",
    description: "Third-person eagle soaring above a sea of clouds, storybook style",
    imageUrl: "/images/cloud_eagle.jpg",
    prompt:
      "This is a third-person-view video of a large eagle soaring above a dense layer of clouds. Crisp storybook rendering style. The eagle remains at the exact centre of the frame at constant size and distance. Neither the eagle nor the camera moves on its own; arrow-key look-input is the only source of camera motion, orbiting around the stable bird only while held. With no event key pressed, the eagle holds a steady, interaction-ready glide with wings fully extended and tail feathers fanned, hovering calmly above the cloud deck.",
    events: [
      {  // lab-selected
        id: "1_0",
        label: "Cloud Dive",
        icon: "☁️",
        key: "1",
        keyLabel: "1",
        addendum:
          "白色鹰向下穿过一层厚厚的白云，短暂进入云雾中，然后从云层另一侧飞出。",
      },
      {  // lab-selected
        id: "2_0",
        label: "Golden Cloud Sea",
        icon: "🌇",
        key: "2",
        keyLabel: "2",
        addendum:
          "云海逐渐变成夕阳下的金色，天空染成橙红色，白色鹰的羽毛边缘被暖光照亮。",
      },
      {  // lab-selected
        id: "3_0",
        label: "Rainbow Ahead",
        icon: "🌈",
        key: "3",
        keyLabel: "3",
        addendum:
          "远处天空出现一道巨大的彩虹，彩虹横跨整片云海，白色鹰朝着彩虹方向继续飞行。",
      },
      {
        id: "f_0",
        label: "White Bird Arrival",
        icon: "🐾",
        key: "f",
        keyLabel: "F",
        addendum:
          "The original focal subject remains the main subject, unchanged in pose and position, while a small white songbird flutters into view from the upper right, dipping and banking sharply above the cloud layer, its wingbeats stirring faint wisps of vapor.",
      },
      {
        id: "g_0",
        label: "Twilight Haze",
        icon: "🌦️",
        key: "g",
        keyLabel: "G",
        addendum:
          "The atmosphere shifts to a soft, violet twilight, the bright sun diffusing into a gentle, hazy glow that washes the entire cloud deck in warm, muted tones.",
      },
    ],
  },
  {
    id: "jetski_chase",
    label: "Jet Ski Chase",
    description: "Chase-cam jet ski carving past a tropical beach (Chinese base prompt)",
    imageUrl: "/images/jetski_chase.jpg",
    prompt:
      "第三人称追尾视角。扮演穿救生衣的人驾驶白色红纹水上摩托，在热带海滩旁的清澈海面上高速前进，身后激起白色浪花和水痕。",
    events: [
      {  // lab-selected
        id: "1_0",
        label: "Full Throttle",
        icon: "💨",
        key: "1",
        keyLabel: "1",
        addendum:
          "水上摩托突然加速向前冲，尾部喷出更高的白色水雾，海面留下明亮的弧形浪痕。",
      },
      {  // lab-selected
        id: "2_0",
        label: "Dolphin Pod",
        icon: "🐬",
        key: "2",
        keyLabel: "2",
        addendum:
          "前方海面出现一群海豚，它们在远处跃出水面，和水上摩托保持安全距离。",
      },
      {  // lab-selected
        id: "3_0",
        label: "Shark Below",
        icon: "🦈",
        key: "3",
        keyLabel: "3",
        addendum:
          "海水变得更加透明，水下出现大鲨鱼。",
      },
      {  // lab-selected
        id: "4_0",
        label: "Floating Water Park",
        icon: "🎡",
        key: "4",
        keyLabel: "4",
        addendum:
          "远处海面升起一座漂浮的彩色水上乐园，有充气滑梯和小旗帜，保持在背景中。",
      },
      {  // lab-selected
        id: "5_0",
        label: "Rainbow Reflection",
        icon: "🌈",
        key: "5",
        keyLabel: "5",
        addendum:
          "天空出现一道巨大的彩虹，彩虹倒映在海面上，水上摩托沿着彩虹反光向前行驶。",
      },
      {  // lab-selected
        id: "6_0",
        label: "Beauty Appears",
        icon: "💃",
        key: "6",
        keyLabel: "6",
        addendum:
          "美女出现。",
      },
      {
        id: "f_0",
        label: "Dolphin Leap",
        icon: "🐾",
        key: "f",
        keyLabel: "F",
        addendum:
          "The original focal subject remains the main subject, unchanged in pose and position, while the rider remains in the same pose on the jet ski, while a sleek dolphin gracefully breaches the water a few meters ahead, its glistening back catching the sunlight as it arcs back into the turquoise sea.",
      },
      {
        id: "g_0",
        label: "Sunset Glow",
        icon: "🌦️",
        key: "g",
        keyLabel: "G",
        addendum:
          "The tropical sun dips toward the horizon, bathing the sky in hues of amber and rose, while the calm waters reflect the warm colors and the distant palm trees turn into dark silhouettes.",
      },
    ],
  },
  {
    id: "pizza_hero",
    label: "Pizza Hero",
    description: "Third-person gameplay where a pizza is the playable character",
    imageUrl: "/images/pizza_hero.jpg",
    prompt:
      "A third-person gameplay video where a pizza is the playable character. The camera follows from behind and slightly above, like a modern 3D game. The pizza smoothly slides across the ground in response to keyboard arrow keys (or WASD), changing direction naturally with game-like movement and physics. It always stays upright while sliding. The scene looks like real gameplay with realistic lighting, smooth camera tracking, high-quality graphics, and an Unreal Engine 5 style.",
    events: [
      {
        id: "f_0",
        label: "Small Squirrel Appears",
        icon: "🐾",
        key: "f",
        keyLabel: "F",
        addendum:
          "The pizza remains the main subject, unchanged in pose, identity, scale, and position, while a small squirrel darts into the frame from the right, its bushy tail flicking as it scurries past the pizza, kicking up tiny puffs of dust from the pavement.",
      },
      {
        id: "g_0",
        label: "Nightfall Cityscape",
        icon: "🌦️",
        key: "g",
        keyLabel: "G",
        addendum:
          "The bustling daytime crowd dissolves into the night, and the towering billboards cast long, vibrant reflections of neon lights across the wet pavement, transforming the scene into a moody, cyberpunk cityscape where the pizza glides effortlessly through the glowing streets.",
      },
    ],
  },
  {
    id: "goldfish",
    label: "Goldfish Tank",
    description: "Third-person goldfish swimming in a freshwater aquarium",
    imageUrl: "/images/goldfish.jpg",
    prompt:
      "This is a third-person-view video of a bright orange goldfish with white-tipped fins swimming in a freshwater aquarium. The goldfish remains at the exact centre of the frame at constant size and distance. Neither the goldfish nor the camera moves on its own; arrow-key look-input is the only source of camera motion, orbiting around the stable fish only while held. With no event key pressed, the goldfish hovers calmly near tall green aquatic plants and a gravel substrate, fins relaxed.",
    events: [
      {  // lab-selected
        id: "f_0",
        label: "Friendly Shrimp Companion",
        icon: "🐾",
        key: "f",
        keyLabel: "F",
        addendum:
          "The original focal subject remains the main subject, unchanged in pose and position, while the bright orange goldfish with white-tipped fins remains at the exact centre of the frame at constant size and distance, hovering calmly near the tall green aquatic plants, while a translucent ghost shrimp scuttles into view from the gravel substrate, its delicate legs kicking up tiny puffs of sediment near the goldfish's tail. The shrimp moves with quick, jerky hops across the pebbles, occasionally pausing to antennae-test the water right beside the goldfish's relaxed pectoral fins.",
      },
      {
        id: "g_0",
        label: "Sunlight Shimmering Over Head",
        icon: "🌦️",
        key: "g",
        keyLabel: "G",
        addendum:
          "The bright orange goldfish with white-tipped fins remains at the exact centre of the frame at constant size and distance, hovering calmly near the tall green aquatic plants, as bright morning sunlight breaks through the aquarium lid, casting dancing, warm golden caustic patterns across the gravel substrate and illuminating the water's surface with a shimmering, lively brilliance that gently ripples the plant leaves. The tank water, previously a uniform deep clarity, now holds floating motes of dust and organic debris that sparkle like tiny stars in the shifting light beams, making the entire e",
      },
    ],
  },
  {
    id: "grass_mage",
    label: "Wandering Mage",
    description: "Robed figure in tall grass; keyed events chain a spell-slinging journey",
    imageUrl: "/images/grass_mage.jpg",
    prompt:
      "This is a third-person-view video of a robed figure standing in a field of tall grass near a wooden signpost. Crisp storybook rendering style. The robed figure remains at the exact centre of the frame at constant size and distance. Neither the figure nor the camera moves on its own; arrow-key look-input is the only source of camera motion, orbiting around the stable figure only while held. With no event key pressed, the figure stands still with arms slightly extended, ready to interact with the nearby signpost.",
    events: [
      {  // lab-selected
        id: "1_0",
        label: "Spellcasting March",
        icon: "✨",
        key: "1",
        keyLabel: "1",
        addendum:
          "主人公穿着浅色长袍，在高草丛中前行，一边走一边施放法术。掌心泛起蓝白色光芒，魔法波纹掠过草地，带起发光草叶和尘土，前方空气被能量冲击撕开。",
      },
      {  // lab-selected
        id: "2_0",
        label: "Summon Warhorse",
        icon: "🐎",
        key: "2",
        keyLabel: "2",
        addendum:
          "主人公在草地中召唤出一匹战马，翻身上马后沿着山坡和树林疾驰。骑行时他释放护盾魔法，金蓝色半透明屏障包裹住人和马，符文在护盾表面旋转，阻挡树枝和碎石冲击。",
      },
      {  // lab-selected
        id: "3_0",
        label: "Desert Portal",
        icon: "🌀",
        key: "3",
        keyLabel: "3",
        addendum:
          "主人公骑马来到荒野中的传送门前，蓝紫色空间漩涡将他和马吞没。传送后，他到达辽阔沙漠，翻身下马，在沙丘间快速奔跑。脚步踏过沙面时扬起金色沙尘，奔跑轨迹在沙丘上留下清晰足印和飞散沙浪。",
      },
      {  // lab-selected
        id: "4_0",
        label: "City Gunfight",
        icon: "🔫",
        key: "4",
        keyLabel: "4",
        addendum:
          "主人公在沙漠中滑行时，再次穿过一座传送门，来到现代城市。高楼大厦密集耸立，他举起枪械连续射击建筑，枪口喷出火光，子弹击碎玻璃幕墙，打出弹孔、火花、烟尘和坠落碎片。",
      },
      {  // lab-selected
        id: "5_0",
        label: "Snowbound Sorcery",
        icon: "❄️",
        key: "5",
        keyLabel: "5",
        addendum:
          "主人公在城市中行走时，大雾突然弥漫，吞没街道和高楼。雾散后，他来到雪山之中，在积雪和冰峰间漫游，并施放蓝白色冰焰与闪电法术，击中雪坡后爆出冰晶、雪浪和强光。",
      },
      {
        id: "f_0",
        label: "Gentle Rabbit Arrival",
        icon: "🐾",
        key: "f",
        keyLabel: "F",
        addendum:
          "The original focal subject remains the main subject, unchanged in pose, identity, scale, and position, while a small rabbit with a fluffy white tail hops into view from the right, its soft nose twitching as it pauses to sniff the tall grass near the robed figure's feet.",
      },
      {
        id: "g_0",
        label: "Fading Daylight",
        icon: "🌦️",
        key: "g",
        keyLabel: "G",
        addendum:
          "The sun dips lower toward the distant mountains, casting long, cool blue shadows across the field and deepening the green of the grass into twilight hues, while the wooden signpost grows dark and indistinct in the gathering dusk.",
      },
    ],
  },
  {
    id: "trex_wilds",
    label: "T-Rex Wilds",
    description: "A tyrannosaur runs through a Cretaceous wilderness as meteors fall (Chinese base prompt)",
    imageUrl: "/images/trex_wilds.jpg",
    prompt:
      "一只霸王龙在原始白垩纪世界荒野上奔跑 远处火山喷发天下掉下来陨石",
    events: [
      {  // lab-selected
        id: "f_0",
        label: "Dino's New Companion",
        icon: "🐾",
        key: "f",
        keyLabel: "F",
        addendum:
          "The original focal subject remains the main subject, unchanged in pose and position, while a small, fluffy triceratops calf tumbles playfully into the foreground from the right, its tiny legs kicking up puffs of dusty earth as it scurries past the towering tyrant's shadow.",
        finalPrompt:
          "The video presents a wide shot of a prehistoric Cretaceous wilderness, dominated by a towering Tyrannosaurus Rex standing firm against a backdrop of erupting volcanoes and falling meteors. And suddenly, a small, fluffy triceratops calf tumbles playfully into the foreground from the right, its tiny legs kicking up puffs of dusty earth as it scurries past the towering tyrant's shadow. The dust cloud lingers in the air, catching the dim light of the chaotic sky.",
      },
      {
        id: "g_0",
        label: "Stormy Sky Descent",
        icon: "🌦️",
        key: "g",
        keyLabel: "G",
        addendum:
          "The overcast sky deepens into a bruised twilight as the falling meteorites grow larger and more numerous, streaking through the thickening clouds with fiery tails, casting long, dramatic shadows across the barren plains while the distant volcano spews a dense column of ash that momentarily blots out the moon.",
      },
    ],
  },
  {
    id: "cyber_witch",
    label: "Cyberpunk Witch",
    description: "Pointed-hat figure walking a wet cyberpunk street",
    imageUrl: "/images/cyber_witch.jpg",
    prompt:
      "This is a third-person-view video of a figure in a black pointed hat and long coat walking down a wet city street. Cyberpunk rendering style. The figure remains at the exact centre of the frame at constant size and distance. Neither the figure nor the camera moves on its own; arrow-key look-input is the only source of camera motion, orbiting around the stable figure only while held. With no event key pressed, the figure stands still in a ready pose, coat hanging straight and feet planted on the pavement.",
    events: [
      {  // lab-selected
        id: "1_0",
        label: "Death Magic",
        icon: "💀",
        key: "1",
        keyLabel: "1",
        addendum:
          "巫师发出绿色的死亡魔法",
      },
      {  // lab-selected
        id: "2_0",
        label: "Flame Magic",
        icon: "🔥",
        key: "2",
        keyLabel: "2",
        addendum:
          "巫师发出红色的火焰魔法",
      },
      {  // lab-selected
        id: "3_0",
        label: "Lightning Magic",
        icon: "⚡",
        key: "3",
        keyLabel: "3",
        addendum:
          "巫师发出蓝色的闪电魔法",
      },
      {  // lab-selected
        id: "4_0",
        label: "Car Levitation",
        icon: "🚗",
        key: "4",
        keyLabel: "4",
        addendum:
          "巫师使用魔法让汽车飘起来",
      },
      {
        id: "f_0",
        label: "Urban Companion Arrival",
        icon: "🐾",
        key: "f",
        keyLabel: "F",
        addendum:
          "The original focal subject remains the main subject, unchanged in pose and position, while a fluffy orange tabby cat materializes on a nearby fire escape above the street. The small feline stretches its paws against the metal railing, its tail twitching as it observes the rain-slicked pavement below.",
      },
      {
        id: "g_0",
        label: "Clearing Skies",
        icon: "🌦️",
        key: "g",
        keyLabel: "G",
        addendum:
          "The heavy mist clinging to the skyscrapers begins to dissipate, revealing the clear night sky above the cyberpunk metropolis. Streetlights shift from a foggy haze to crisp, sharp beams, casting long, defined reflections across the still-wet pavement.",
      },
    ],
  },
  {
    id: "grey_column",
    label: "Grey Column",
    description: "Three soldiers walking away down a dusty military road",
    imageUrl: "/images/grey_column.jpg",
    prompt:
      "This is a third-person-view video of three soldiers in grey uniforms and steel helmets walking away from the viewer, in a dusty military encampment. Gritty realism atmosphere. The soldiers are locked at the exact centre of the frame at constant size and distance. Neither the soldiers nor the camera moves on its own; arrow-key look-input is the only source of camera motion, orbiting the camera around the stationary soldiers only while held. The soldiers remain frozen mid-stride, their rifles held still, amidst the static backdrop of military vehicles and distant smoke. /1explosure everywhere",
    events: [
      {
        id: "f_0",
        label: "Birds on the horizon",
        icon: "🐾",
        key: "f",
        keyLabel: "F",
        addendum:
          "The original focal subject remains the main subject, unchanged in pose, identity, scale, and position, while a small flock of common seagulls drifts low across the dusty sky above the encampment. One bird banks sharply, its wings casting a fleeting shadow over the distant smoke plumes, adding a quiet ripple of movement to the otherwise still scene.",
      },
      {
        id: "g_0",
        label: "Snowy encampment",
        icon: "🌦️",
        key: "g",
        keyLabel: "G",
        addendum:
          "The environment shifts seamlessly into a muted winter landscape, where the dusty road and military grounds are softened by a light dusting of fresh snow. The smoke from the burning vehicle now rises in thicker, colder plumes against the overcast sky, and the distant trees stand bare, preserving the scene's identity while transforming its global atmosphere.",
      },
    ],
  },
  {
    id: "long_retreat",
    label: "The Long Retreat",
    description: "Oil-painting first-person ride past Napoleon's army retreating from Russia (Chinese base prompt)",
    imageUrl: "/images/long_retreat.jpg",
    prompt:
      "油画风格 画面中我的视角骑着马 看着在暴风雪中从俄罗斯撤退的拿破仑军队 所有人都在前进 残兵败将 受伤残疾 士气低落 缓慢行军 18世纪初风格",
    events: [
      {
        id: "f_0",
        label: "Wandering Fox",
        icon: "🐾",
        key: "f",
        keyLabel: "F",
        addendum:
          "The officer on horseback remains the main subject, unchanged in pose and position, while a red fox trots playfully through the deep snow nearby, its fur bright against the white drifts and a puff of breath visible in the cold air.",
      },
      {
        id: "g_0",
        label: "Clearing Skies",
        icon: "🌦️",
        key: "g",
        keyLabel: "G",
        addendum:
          "The heavy blizzard dissipates, revealing a vast, frozen field under a pale, overcast sky, though the ground remains covered in deep, uneven snow and the distant treeline stands stark and white against the horizon.",
      },
    ],
  },
  {
    id: "desert_knight",
    label: "Desert Knight",
    description: "Steel-helmed knight on horseback in the desert, facing the camera (Chinese base prompt)",
    imageUrl: "/images/desert_knight.jpg",
    prompt:
      "第三人称视角漫游场景 带着钢铁头盔的骑士面朝镜头骑马 在沙漠中",
    events: [
      {
        id: "f_0",
        label: "Friendly Camel Approach",
        icon: "🐾",
        key: "f",
        keyLabel: "F",
        addendum:
          "The original focal subject remains the main subject, unchanged in pose and position, while the knight in polished armor remains centered on his horse, unchanged in pose and scale, while a gentle camel with a soft muzzle wanders into the sandy foreground from the right, kicking up a small puff of gold dust as it pauses to nibble the dry grass. The camel’s long eyelashes blink against the desert wind, its broad back swaying gently behind the knight’s steady shoulders.",
      },
      {
        id: "f_1",
        label: "Sand Fox Approaches",
        icon: "🐾",
        addendum:
          "The original focal subject remains the main subject, unchanged in pose and position, while the armored knight remains the central figure, motionless atop the horse, when a small sand fox appears from a nearby dune ridge, its ears twitching as it pauses to observe the rider from a safe distance.",
      },
      {
        id: "g_0",
        label: "Twilight Desert Glow",
        icon: "🌦️",
        key: "g",
        keyLabel: "G",
        addendum:
          "The vast dunes around the knight soften into a warm amber glow, the sky deepening to a gradient of peach and lavender as low-hanging clouds catch the last sunlight, while the sand ripples take on a metallic sheen that mirrors the knight’s armor in the fading light.",
      },
      {
        id: "g_1",
        label: "Golden Hour Transition",
        icon: "🌦️",
        addendum:
          "The surrounding desert landscape slowly transitions into the warm glow of golden hour, with the sunlight intensifying and casting long, stretching shadows across the rippling sand dunes.",
      },
    ],
  },
  {
    id: "hill_knight",
    label: "Hill Knight",
    description: "Armored knight standing on a grassy hill, sword on his back",
    imageUrl: "/images/hill_knight.jpg",
    prompt:
      "This is a third-person-view video of a knight in armor standing on a grassy hill with a large sword on his back and a shield at his side. The knight remains at the exact centre of the frame at constant size and distance. Neither the knight nor the camera moves on its own; arrow-key look-input is the only source of camera motion, orbiting around the stable knight only while held. With no event key pressed, the knight stands still on the path, facing the distant valley, his cloak and the tall grass resting calmly.",
    events: [
      {
        id: "f_0",
        label: "Faithful Hound Appears",
        icon: "🐾",
        key: "f",
        keyLabel: "F",
        addendum:
          "The original focal subject remains the main subject, unchanged in pose and position, while a faithful hound trots out from the tall grass behind the knight, its ears fluttering as it nudges the knight's boots with a soft wag.",
      },
      {
        id: "g_0",
        label: "Golden Hour Transitions",
        icon: "🌦️",
        key: "g",
        keyLabel: "G",
        addendum:
          "The warm golden hour light gradually deepens into a rich twilight, casting long shadows across the grassy hill as the sky transitions from soft orange to deep indigo, with the valley river reflecting the last hues of sunset.",
      },
    ],
  },
  {
    id: "dark_ward",
    label: "Dark Ward",
    description: "First-person flashlight sweep through a derelict hospital; number keys summon horrors",
    imageUrl: "/images/dark_ward.jpg",
    prompt:
      "This is a first-person-view video from the operator's position holding a flashlight in a dilapidated hospital corridor. Gritty survival atmosphere. The flashlight beam remains at the exact centre of the frame at constant size and distance. Neither the flashlight nor the camera moves on its own; arrow-key look-input is the only source of camera motion, orbiting around the stable light source only while held. With no event key pressed, the gloved hands stay steady and relaxed, keeping the beam fixed on the peeling walls and abandoned gurneys ahead.",
    events: [
      {
        id: "1_0",
        label: "Zombie Patient",
        icon: "🧟",
        key: "1",
        keyLabel: "1",
        addendum:
          "病房门里伸出一只苍白腐烂的手，一个僵尸病人拖着僵硬身体缓慢走出门口，头低垂着，肩膀抽动，脚步沉重，地面传来湿冷拖行声。",
        finalPrompt:
          "The video presents a first-person view from a flashlight-wielding operator in a dilapidated hospital corridor, the beam fixed at the center. And suddenly, a pale, rotting hand reaches out from the ward doorway, followed by a zombie patient dragging its stiff body slowly across the threshold. The creature’s head hangs low, shoulders twitching with each heavy, wet step. As it shuffles forward, the flashlight beam catches the glistening decay on its skin, illuminating the damp, cold floor where its dragging feet leave faint, wet trails in the dust.",
      },
      {
        id: "2_0",
        label: "Vampire in the Doorway",
        icon: "🧛",
        key: "2",
        keyLabel: "2",
        addendum:
          "僵尸病人在门口停留片刻后，身体被黑暗吞没，逐渐消失。病房门无声打开，门内站着一名苍白吸血鬼，穿着破旧黑色礼服，脸隐藏在阴影中，只露出冰冷眼神和尖牙。门后的黑暗像浓雾一样向走廊缓慢蔓延。",
        finalPrompt:
          "The video presents a first-person view from a flashlight-wielding operator in a dilapidated hospital corridor, the beam fixed at the center of the frame. And suddenly, a zombie patient lingers at the doorway before the darkness swallows its form, causing it to fade into nothingness. The ward door slides open silently, revealing a pale vampire in a tattered black suit, its face obscured by shadow except for cold eyes and sharp fangs. Thick, fog-like darkness begins to creep slowly from the room into the corridor, swallowing the light.",
      },
      {
        id: "3_0",
        label: "Behemoth at the Gate",
        icon: "👹",
        key: "3",
        keyLabel: "3",
        addendum:
          "吸血鬼静静凝视一段时间后，化成黑雾消散在门内。走廊尽头的铁门剧烈震动，门缝中传出低沉吼声。一个高大怪兽从门里挤出，肩膀撞歪门框，爪子刮过墙面，墙皮和灰尘大片掉落，只能看到巨大的头部和起伏呼吸。",
        finalPrompt:
          "The video presents a first-person view from a flashlight-wielding operator in a dilapidated hospital corridor, the beam fixed at the center. And suddenly, a vampire staring silently dissolves into black mist inside the doorway. The iron door at the end of the hall shudders violently, emitting a low growl. A towering monster squeezes through the frame, its shoulder wrenching the doorframe askew while claws scrape the wall, shedding large flakes of plaster and dust. Only its massive head and heaving breath remain visible in the gloom.",
      },
      {
        id: "4_0",
        label: "Werewolf Crouch",
        icon: "🐺",
        key: "4",
        keyLabel: "4",
        addendum:
          "高大怪兽咆哮片刻后，轮廓被烟尘覆盖，慢慢消失。门内传来沉重喘息，一个狼人般的畸形怪物蹲在病房地面，背部剧烈起伏，利爪抓着破旧床架。它猛地抬头，双眼反光，门框被它的身体挤得吱呀作响。",
        finalPrompt:
          "The video presents a first-person view from a flashlight-wielding operator in a dilapidated hospital corridor, beam fixed at the center. And suddenly, a towering monster roars, its silhouette dissolving into thick dust before vanishing. Heavy breathing erupts from within a nearby room as a wolf-like mutant crouches on the floor, claws digging into a broken bed frame. It snaps its head up, eyes flashing, forcing the doorframe to groan under its immense bulk. The wood splinters slightly as the creature braces itself.",
      },
      {
        id: "5_0",
        label: "Clown with a Balloon",
        icon: "🤡",
        key: "5",
        keyLabel: "5",
        addendum:
          "狼人般的畸形怪物低吼一段时间后，向后退入阴影，逐渐消失。前方路中间突然出现一个穿破旧戏服的小丑，歪着头站在门边，手里拿着红色气球，脸上的笑容僵硬夸张。灯光闪烁时，小丑的位置不断变化，时而在门口，时而出现在更近的病床旁。它停留片刻后，红色气球先爆裂，小丑随即消失在闪烁灯光中。",
        finalPrompt:
          "The video presents a first-person view from a flashlight-wielding operator in a dilapidated hospital corridor, gritty survival atmosphere. And suddenly, a werewolf-like monster retreats into the shadows, vanishing as a clown in tattered costume appears in the center, holding a red balloon. The clown’s position shifts erratically between the doorway and a nearby bed as the lights flicker. The red balloon bursts with a sharp pop, and the clown dissolves into the darkness.",
      },
      {
        id: "f_0",
        label: "Flashlight On",
        icon: "🔦",
        key: "f",
        keyLabel: "F",
        addendum:
          "主人公的手电筒开着。",
        finalPrompt:
          "The video presents a first-person view from a dilapidated hospital corridor, gritty survival atmosphere. The flashlight beam remains centered at a constant size and distance. And suddenly, the operator's hand tightens its grip on the flashlight, the beam illuminating the peeling paint and rusted medical equipment ahead. Dust motes dance in the stark light as the beam cuts through the oppressive darkness, revealing the decay of the abandoned ward.",
      },
      {
        id: "g_0",
        label: "Flashlight Off",
        icon: "🌑",
        key: "g",
        keyLabel: "G",
        addendum:
          "主人公的手电筒关上。",
      },
      {
        id: "space_0",
        label: "Jump",
        icon: "🦘",
        key: " ",
        keyLabel: "Space",
        addendum:
          "The current controllable subject springs upward into the air.",
        finalPrompt:
          "This is a first-person-view video from the operator's position holding a flashlight in a dilapidated hospital corridor. Gritty survival atmosphere. The flashlight beam remains at the exact centre of the frame at constant size and distance. Neither the flashlight nor the camera moves on its own; arrow-key look-input is the only source of camera motion, orbiting around the stable light source only while held. With no event key pressed, the gloved hands stay steady and relaxed, keeping the beam fixed on the peeling walls and abandoned gurneys ahead. The current controllable subject springs upward into the air.",
      },
    ],
  },
  {
    id: "rally_cockpit",
    label: "Rally Cockpit",
    description: "First-person rally car cockpit, gritty realism",
    imageUrl: "/images/rally_cockpit.jpg",
    prompt:
      "This is a first-person-view video from the driver's position inside a rally car cockpit. Gritty realism atmosphere. The steering wheel and dashboard remain at the exact centre of the frame at constant size and distance. Neither the steering wheel nor the camera moves on its own; arrow-key look-input is the only source of camera motion, orbiting around the stable vehicle interior only while held. With no event key pressed, the driver's gloved hands stay relaxed on the wheel, ready to steer or shift gears.",
    events: [
      {
        id: "f_0",
        label: "Headlights On",
        icon: "💡",
        key: "f",
        keyLabel: "F",
        addendum:
          "车灯亮了",
        finalPrompt:
          "The video presents a gritty first-person view from inside a rally car cockpit, with the steering wheel and dashboard fixed at the center of the frame. And suddenly, the exterior headlights switch on, casting a sudden, intense beam of white light that floods the dark interior and illuminates the dust motes dancing in the air. The sudden glare reflects sharply off the dashboard glass, creating a stark contrast against the surrounding shadows.",
      },
      {
        id: "g_0",
        label: "Wipers On",
        icon: "🌧️",
        key: "g",
        keyLabel: "G",
        addendum:
          "雨刮器摆动",
        finalPrompt:
          "The video presents a gritty first-person view from inside a rally car cockpit, with the steering wheel and dashboard fixed at the center of the frame. And suddenly, the windshield wipers swing into motion, their rubber blades sweeping across the glass in a rhythmic arc. The movement clears a thin layer of mist, leaving streaks of condensation that quickly reform on the cold surface.",
      },
      {
        id: "space_0",
        label: "Jump",
        icon: "🦘",
        key: " ",
        keyLabel: "Space",
        addendum:
          "The current controllable subject springs upward into the air.",
        finalPrompt:
          "This is a first-person-view video from the driver's position inside a rally car cockpit. Gritty realism atmosphere. The steering wheel and dashboard remain at the exact centre of the frame at constant size and distance. Neither the steering wheel nor the camera moves on its own; arrow-key look-input is the only source of camera motion, orbiting around the stable vehicle interior only while held. With no event key pressed, the driver's gloved hands stay relaxed on the wheel, ready to steer or shift gears. The current controllable subject springs upward into the air.",
      },
    ],
  },
  {
    id: "boss_gauntlet",
    label: "Boss Gauntlet",
    description: "First-person sci-fi shooter that world-hops between boss arenas (Chinese base prompt)",
    imageUrl: "/images/boss_gauntlet.jpg",
    prompt:
      "整体为第一人称视角的科幻奇幻战斗漫游场景，第一人称主角在场景漫游，并根据环境切换风格一致但差异明显的武器或战斗工具，但都是枪械。画面强调第一视角移动、场景突变、武器切换、Boss 攻击和强烈破坏效果。攻击瞄准的敌人，会被击杀。",
    events: [
      {
        id: "1_0",
        label: "Neon City Sniper",
        icon: "🌃",
        key: "1",
        keyLabel: "1",
        addendum:
          "第一人称视角出现在霓虹未来城市街区，雨夜街道、广告灯牌和高楼天桥充满画面。远处屋顶上出现“独眼机械狙击 Boss”，它拥有红色独眼镜头和折叠炮臂。主角切换成高精度狙击枪，开启狙击镜瞄准核心射击，蓝色光轨贯穿目标，Boss 被打成碎片，镜头零件和金属外壳从屋顶飞散。",
        finalPrompt:
          "The video presents a first-person drift through a neon-drenched cyberpunk city, rain slicking the streets beneath towering skyscrapers. And suddenly, the protagonist raises a high-precision sniper rifle, the scope locking onto a one-eyed mechanical boss perched on a distant rooftop. A piercing blue light trail shoots from the barrel, striking the enemy's core with devastating force. The boss shatters into fragments, sending lens parts and metal plating scattering into the rainy night air.",
      },
      {
        id: "2_0",
        label: "Sky Temple Minotaur",
        icon: "🏛️",
        key: "2",
        keyLabel: "2",
        addendum:
          "第一人称视角，霓虹灯突然熄灭，城市街道被一阵旋转的云雾吞没，场景转化为一座漂浮在云层上的古代空中神殿。脚下是断裂石桥、金色云海和悬浮石柱，一只“牛头巨斧 Boss”从神殿闸门中冲出，挥舞巨斧震碎平台。巨大的金色羽扇，挥动时卷起强烈神风，风刃沿着石桥向前切开空气，连续命中 Boss 的头部和胸口核心。最终 Boss 被打成碎片，牛角、盔甲和碎石被神风卷入云海。",
        finalPrompt:
          "The video presents a first-person drift through a neon-drenched cyberpunk city, rain slicking the streets beneath towering skyscrapers. And suddenly, the neon lights die, and swirling mist engulfs the scene, transforming the environment into an ancient floating temple above golden clouds. The first-person view reveals broken stone bridges and suspended pillars. A Minotaur axe-wielding boss charges from the temple gates, swinging its massive axe to shatter the platform. A giant golden feather fan sweeps forward, generating fierce wind blades that slice through the air, striking the boss's head and chest core. The boss explodes into fragments, with horns, armor, and debris swept into the sea of clouds.",
      },
      {
        id: "3_0",
        label: "Deep-Sea Priest",
        icon: "🐙",
        key: "3",
        keyLabel: "3",
        addendum:
          "第一人称视角，空中神殿被海浪吞没，场景转化为深海遗迹。第一人称视角漂浮在蓝绿色海水中，周围是沉没神庙、珊瑚和发光水母。“章鱼祭司 Boss”从遗迹门后出现，挥动多条触手。主角切换成电磁鱼叉，射出带电锁链刺穿 Boss 核心，电流在海水中扩散，Boss 被打成碎片，触手残骸和气泡四散上浮。",
        finalPrompt:
          "The video presents a first-person drift through a neon-drenched cyberpunk city, rain slicking the streets beneath towering skyscrapers. And suddenly, the scene dissolves as the sky temple is swallowed by waves, transforming into a sunken deep-sea ruin. The viewer floats in blue-green water, surrounded by coral and glowing jellyfish. The Octopus Priest Boss emerges from the ruins, swinging multiple tentacles. The protagonist switches to an electromagnetic harpoon, firing a charged chain that pierces the Boss's core. Currents spread through the water, shattering the Boss into fragments as tentacle debris and bubbles rise.",
      },
      {
        id: "4_0",
        label: "Lava Giant",
        icon: "🌋",
        key: "4",
        keyLabel: "4",
        addendum:
          "第一人称视角，深海光线骤然变红，水流化成漫天火星，场景转化为火山熔岩谷。黑色岩石、流动岩浆和喷发火山包围视野，“熔岩巨人 Boss”从岩浆池中站起，身体裂缝流出火光。主角切换成火焰飞镖，连续投掷燃烧飞镖攻击 Boss 的熔岩核心，命中后引发连锁爆燃。最终 Boss 被打成碎片，熔岩岩块、火焰碎屑和红色烟尘一起爆散。",
        finalPrompt:
          "The video presents a first-person drift through a submerged temple, blue-green water swirling around ancient stone pillars and glowing jellyfish. And suddenly, the deep-sea light turns crimson as water transforms into flying sparks, shifting the scene to a volcanic lava valley. The protagonist switches to flame darts, hurling burning projectiles at the rising lava giant boss. Each hit triggers a chain explosion, shattering the boss into molten rock fragments and red dust that burst outward.",
      },
      {
        id: "5_0",
        label: "Ice Mammoth",
        icon: "🦣",
        key: "5",
        keyLabel: "5",
        addendum:
          "第一人称视角，火山灰变成飞雪，场景转化为极地冰原。暴风雪遮住天空，冰川和冻结战舰横在远处，“冰甲猛犸 Boss”踏碎冰面冲来。主角切换成激光切割刃，近距离横扫 Boss 的冰甲，炽白光刃切开厚冰和装甲，Boss 被打成碎片，冰块、金属甲片和雪雾爆散。",
        finalPrompt:
          "The video presents a first-person drift through a neon-drenched cyberpunk city, rain slicking the streets beneath towering skyscrapers. And suddenly, volcanic ash transforms into blinding snow, shifting the environment to a frozen wasteland where a massive Ice Armored Mammoth Boss shatters the ice to charge. The protagonist swings a laser cutting blade, slicing through the beast's thick armor with a searing white arc. The impact explodes the mammoth into fragments, sending shards of ice, metal plating, and snow mist scattering violently across the blinding storm.",
      },
      {
        id: "6_0",
        label: "Orbital Dragon",
        icon: "🐉",
        key: "6",
        keyLabel: "6",
        addendum:
          "第一人称视角，冰原天空裂开星门，场景转化为太空轨道平台。脚下是金属甲板，远处能看到蓝色星球和漂浮陨石。“机械飞龙 Boss”展开钢铁龙翼，在失重环境中盘旋喷射激光。主角先切换成重力手套定住 Boss，再切换成重型能量炮蓄力轰击胸口核心，Boss 被打成碎片，金属龙翼和机械残骸在太空中爆散。",
      },
      {
        id: "f_0",
        label: "Urban Peregrine",
        icon: "🐾",
        key: "f",
        keyLabel: "F",
        addendum:
          "The original focal subject remains the main subject, unchanged in pose and position, while the shooter's steady hands hold the futuristic rifle, unchanged in stance and position, while a peregrine falcon glides silently through the neon-lit alley from behind the sniper, its wings catching the pink sunset glow as it banks sharply around the drone overhead.",
      },
      {
        id: "f_1",
        label: "Beetle Approach",
        icon: "🐾",
        addendum:
          "The original focal subject remains the main subject, unchanged in pose and position, while the first-person protagonist remains anchored in the center of the frame, unchanged in pose and position, while a large iridescent scarab beetle skitters across the cold stone floor just past the boots, its armored shell clicking softly against the ground.",
      },
      {
        id: "g_0",
        label: "Neon Midnight",
        icon: "🌦️",
        key: "g",
        keyLabel: "G",
        addendum:
          "The twilight air deepens into a heavy neon-noir midnight, amplifying the electric blue and magenta glows from the holographic signs and the cyberpunk weapon, while the sky clears into a crisp, star-filled void above the futuristic skyline.",
      },
      {
        id: "g_1",
        label: "Frozen Ruins",
        icon: "🌦️",
        addendum:
          "A sudden blizzard washes over the ancient ruins, transforming the warm amber glow into a deep twilight blue as thick frost coats the stone pillars and heavy snowflakes swirl rapidly in the foreground, blanketing the cracked floor in a fresh, undisturbed layer of white.",
      },
      {
        id: "o_0",
        label: "Fires Plasma Rifle",
        icon: "💥",
        key: "o",
        keyLabel: "O",
        addendum:
          "The first-person protagonist aims the glowing futuristic rifle and fires a bolt of searing energy that strikes the yellow neon sign on the right, causing the sign to explode in a burst of sparks and debris.",
        finalPrompt:
          "The video presents a first-person sci-fi combat roam, the protagonist navigating a shifting environment while wielding distinct futuristic firearms. And suddenly, the player aims a glowing rifle and fires a searing energy bolt that strikes a yellow neon sign on the right, causing it to explode in a burst of sparks and debris. Shattered glass and smoke drift through the air as the protagonist holds the aim steady.",
      },
      {
        id: "o_1",
        label: "Fires Railgun",
        icon: "💥",
        addendum:
          "The first-person protagonist fires the heavy railgun with a deafening crack, sending a blinding lance of plasma energy screaming toward the giant robot boss in the distance; the superheated projectile strikes the robot's armored chassis, erupting in a shower of sparks and molten metal as the massive machine shudders and reels from the catastrophic impact.",
      },
      {
        id: "o_2",
        label: "Casts Plasma Bolt",
        icon: "💥",
        addendum:
          "The first-person protagonist fires a bright blue energy bolt from their glowing rifle, striking the large yellow robot directly in its glowing eye socket and causing it to reel back in pain as sparks fly from the impact.",
        finalPrompt:
          "The video presents a first-person sci-fi combat roam, the protagonist navigating a shifting environment while wielding distinct firearms. And suddenly, the player fires a bright blue energy bolt from a glowing rifle, striking a large yellow robot directly in its glowing eye socket. The impact sends sparks flying as the machine reels back in pain, its metallic frame shuddering under the force of the blast.",
      },
      {
        id: "o_3",
        label: "Fires Energy Rifle",
        icon: "💥",
        addendum:
          "The yellow-and-black combat mech raises its large rifle from its mechanical arm and fires a bright orange energy bolt that streaks across the alley. The bolt strikes a parked car in the background, causing the side window to shatter violently into glass fragments that scatter across the pavement while the car's body shows fresh scorch marks.",
      },
      {
        id: "o_4",
        label: "Fires Assault Rifle",
        icon: "💥",
        addendum:
          "The first-person protagonist aims down the blue-glowing sight and fires a burst of rapid projectiles, the muzzle flash briefly illuminating the concrete corridor. The yellow-suited enemy ahead staggers backward as the shots strike their armor, causing them to collapse heavily to the ground, motionless.",
        finalPrompt:
          "The video presents a first-person drift through a submerged temple, blue-green water swirling around ancient stone pillars and glowing jellyfish. And suddenly, the protagonist aims down the blue-glowing sight and fires a burst of rapid projectiles, the muzzle flash briefly illuminating the concrete corridor. The yellow-suited enemy ahead staggers backward as the shots strike their armor, causing them to collapse heavily to the ground, motionless. Water ripples distort around the fallen figure.",
      },
      {
        id: "o_5",
        label: "Fires Energy Pistol",
        icon: "💥",
        addendum:
          "The first-person protagonist fires the energy pistol, and a high-velocity beam erupts from the muzzle, striking a metallic crate in the distant corridor. The crate explodes upon impact, sending shards of metal shrapnel and smoke scattering across the floor.",
        finalPrompt:
          "The video presents a first-person drift through a submerged temple, blue-green water swirling around ancient stone pillars and glowing jellyfish. And suddenly, the protagonist fires the energy pistol, sending a high-velocity beam from the muzzle to strike a metallic crate in the distant corridor. The crate explodes upon impact, sending shards of metal shrapnel and smoke scattering across the floor.",
      },
      {
        id: "o_6",
        label: "Launches Fire Ball",
        icon: "💥",
        addendum:
          "The arms thrust forward and a blazing fireball erupts from the palms, arcing toward a distant stone pillar that explodes in a shower of crumbling rubble and scorch marks.",
        finalPrompt:
          "The video presents a first-person drift through a submerged temple, blue-green water swirling around ancient stone pillars. And suddenly, the arms thrust forward as a blazing fireball erupts from the palms, arcing toward a distant stone pillar that explodes in a shower of crumbling rubble and scorch marks. Debris tumbles into the churning water, sending up plumes of steam and bubbles as the current carries the fragments away.",
      },
      {
        id: "o_7",
        label: "Launches Fire Projectile",
        icon: "💥",
        addendum:
          "The white-furred creature exhales a concentrated, roaring projectile of magical fire that streaks forward across the snowy ground and slams into the stone wall opposite, causing the masonry to violently crack and scorch with blackened debris that showers downward. Sparks and embers scatter across the impact zone, leaving a jagged, glowing fissure where the solid barrier once stood intact.",
        finalPrompt:
          "The video presents a first-person drift through a submerged temple, blue-green water swirling around ancient stone pillars. And suddenly, a white-furred creature exhales a concentrated, roaring projectile of magical fire that streaks across the snowy ground. The blast slams into the opposite stone wall, causing the masonry to violently crack and scorch with blackened debris that showers downward. Sparks and embers scatter across the impact zone, leaving a jagged, glowing fissure where the solid barrier once stood intact.",
      },
      {
        id: "o_8",
        label: "Fires Flaming Shot",
        icon: "💥",
        addendum:
          "The first-person protagonist aims their weapon and fires a flaming projectile into the distance; the bolt strikes a stone pillar ahead, instantly scorching the surface and sending a burst of sparks and debris flying as it shatters under the impact.",
        finalPrompt:
          "The video presents a first-person drift through a submerged temple, blue-green water swirling around ancient stone pillars. And suddenly, the protagonist aims their weapon and fires a flaming projectile into the distance. The bolt strikes a stone pillar ahead, instantly scorching the surface and sending a burst of sparks and debris flying as it shatters under the impact. Chunks of wet stone crumble into the dark water below.",
      },
      {
        id: "o_9",
        label: "Fires Energy Pistol",
        icon: "💥",
        addendum:
          "The unseen first-person shooter grips the dark tactical firearm, the gun’s blue accent strips glowing intensely as it fires a concentrated bolt of plasma down the corridor; the projectile screams through the air and slams into the stone wall ahead, detonating in a violent burst that shatters the masonry into a cloud of dust and glowing orange shrapnel.",
        finalPrompt:
          "The video presents a first-person drift through a submerged temple, blue-green water swirling around ancient stone pillars. And suddenly, the unseen shooter grips a dark tactical firearm with glowing blue accent strips, firing a concentrated plasma bolt down the corridor. The projectile screams through the air and slams into the stone wall ahead, detonating in a violent burst that shatters the masonry into a cloud of dust and glowing orange shrapnel. Debris rains down as the water ripples from the shockwave.",
      },
      {
        id: "o_10",
        label: "Unleashes Fireball",
        icon: "💥",
        addendum:
          "The weapon erupts with a burst of searing fire, launching a blazing projectile straight ahead that slams into the distant stone pillars, scorching the rock black and sending a shower of sparks and debris scattering across the pool.",
        finalPrompt:
          "The video presents a first-person drift through a submerged temple, blue-green water swirling around ancient stone pillars. And suddenly, the unseen shooter grips a dark tactical firearm with glowing blue accent strips and fires a searing projectile straight ahead. The blazing shot slams into the distant stone pillars, scorching the rock black and sending a violent shower of sparks and debris scattering across the pool. The impact sends shockwaves through the water, distorting the light as the debris settles.",
      },
      {
        id: "o_11",
        label: "Fires Plasma Rifle",
        icon: "💥",
        addendum:
          "The first-person protagonist aims the plasma rifle at the towering golden statue in the distance, and a high-energy bolt streaks across the air, striking the stone surface. The impact causes the statue to explode into a massive cloud of molten rock and debris, scattering glowing embers and fracturing the ancient masonry walls with a deafening shockwave.",
      },
      {
        id: "o_12",
        label: "Fires Energy Burst",
        icon: "💥",
        addendum:
          "The first-person protagonist aims the futuristic firearm and releases a rapid stream of glowing energy projectiles down the corridor, striking a stone wall further ahead where the impacts scorch black cracks into the masonry and send clouds of hot dust billowing into the air.",
      },
      {
        id: "o_13",
        label: "Fires Energy Rifle",
        icon: "💥",
        addendum:
          "The player aims the glowing yellow-accented energy rifle and fires a rapid burst of shots toward the distant ledge. The lead projectile strikes a concrete pillar, splintering the stone and sending a puff of black debris into the air.",
        finalPrompt:
          "The video presents a first-person view drifting through a neon-drenched cyberpunk city at night, rain slicking the streets beneath towering skyscrapers. And suddenly, the player aims a glowing yellow-accented energy rifle and fires a rapid burst of shots toward a distant ledge. The lead projectile strikes a concrete pillar, splintering the stone and sending a puff of black debris into the air. Dust settles on the wet pavement as the weapon's glow fades.",
      },
      {
        id: "o_14",
        label: "Fires Plasma Cannon",
        icon: "💥",
        addendum:
          "The pilot in the cockpit of the hover vehicle braces against the seat's vibration as they trigger the vehicle's mounted plasma cannon, unleashing a scorching beam that streaks across the wet street toward a distant traffic control box. The impact is explosive, splintering the metal casing and sending sparks showering over the rain-slicked pavement.",
        finalPrompt:
          "The video presents a first-person view drifting through a neon-drenched cyberpunk city at night, rain slicking the streets beneath towering skyscrapers. And suddenly, the pilot in the cockpit braces against the seat's vibration, triggering the mounted plasma cannon to unleash a scorching beam streaking toward a distant traffic control box. The impact explodes, splintering the metal casing and sending sparks showering over the rain-slicked pavement.",
      },
      {
        id: "o_15",
        label: "Fires Future Rifle",
        icon: "💥",
        addendum:
          "The shooter fires the high-tech rifle forward, its glowing blue rounds tearing through the air with sharp crackles. A distant streetlamp is struck, causing the glass bulb to shatter into a shower of sparks and debris.",
      },
      {
        id: "o_16",
        label: "Fires Plasma Cannon",
        icon: "💥",
        addendum:
          "The gunner squeezes the trigger of the heavy cannon, unleashing a blazing orange beam that tears through the frigid air and slams into the ice beast's flank, blasting a burst of shattered crystals and smoke from its crystalline armor as the creature shudders and recoils violently under the searing impact.",
        finalPrompt:
          "The video presents a first-person drift through a neon-drenched cyberpunk city, rain slicking the streets beneath towering skyscrapers. And suddenly, the gunner squeezes the trigger of the heavy cannon, unleashing a blazing orange beam that tears through the frigid air and slams into the ice beast's flank. The impact blasts a burst of shattered crystals and smoke from its crystalline armor as the creature shudders and recoils violently under the searing heat.",
      },
      {
        id: "o_17",
        label: "Cast Fire Bolt",
        icon: "💥",
        addendum:
          "The first-person protagonist thrusts their hand forward, hurling a blazing firebolt that streaks through the air to strike the distant fireball, intensifying its raging flames and sending a spray of sparks into the snowy street.",
      },
      {
        id: "o_18",
        label: "Fires Flame Shot",
        icon: "💥",
        addendum:
          "The armored warrior fires a scorching projectile from a glowing wrist-mounted cannon, and the blast sears a dark, scorching crack across the stone pillar in the distance, sending puffs of black smoke into the air.",
        finalPrompt:
          "The video presents a first-person drift through a neon-drenched cyberpunk city, rain slicking the streets beneath towering skyscrapers. And suddenly, the armored warrior fires a scorching projectile from a glowing wrist-mounted cannon, searing a dark, jagged crack across a distant stone pillar. Thick puffs of black smoke billow into the air as the impact shudders through the frame, leaving the scorched masonry smoking against the wet urban backdrop.",
      },
      {
        id: "o_19",
        label: "Casts Solar Blast",
        icon: "💥",
        addendum:
          "The armored angel summons a concentrated beam of solar energy from their radiant visor, firing it directly at a distant stone pillar in the temple. The searing projectile strikes the ancient masonry, causing the surface to instantly scorch and crack as debris showers down from the impact.",
        finalPrompt:
          "The video presents a first-person sci-fi fantasy combat roam, the protagonist navigating a shifting temple environment with distinct weapon swaps. And suddenly, the armored angel summons a concentrated beam of solar energy from their radiant visor, firing it directly at a distant stone pillar. The searing projectile strikes the ancient masonry, causing the surface to instantly scorch and crack as debris showers down from the impact. Dust clouds billow outward, obscuring the fractured stone as the beam dissipates into the dim air.",
      },
      {
        id: "o_20",
        label: "Fires Energy Rifle",
        icon: "💥",
        addendum:
          "The soldier in the foreground raises their large, glowing energy rifle and fires a bright orange beam across the arena. The projectile strikes a distant enemy figure standing near a pillar, engulfing them in a burst of flames and sparks that sends their body jerking back before they collapse to the ground.",
        finalPrompt:
          "The video presents a first-person sci-fi combat roam, weapon in hand, scanning a dim arena. And suddenly, the soldier raises a large glowing energy rifle and fires a bright orange beam across the space. The projectile strikes a distant enemy near a pillar, engulfing them in a burst of flames and sparks. The figure jerks back violently before collapsing to the ground, leaving a trail of smoke.",
      },
      {
        id: "o_21",
        label: "Fires Fire Blast",
        icon: "💥",
        addendum:
          "The protagonist channels a concentrated burst of fire from their weapon and releases a blazing projectile that streaks forward, striking a distant wall section where it detonates into a violent explosion of fire and shattering debris, scorching the surface and sending a cloud of black smoke billowing outward.",
        finalPrompt:
          "The video presents a first-person sci-fi combat roam, weapon in hand, scanning a dimly lit corridor. And suddenly, the protagonist channels a concentrated burst of fire, releasing a blazing projectile that streaks forward. It strikes a distant wall section, detonating into a violent explosion of fire and shattering debris. The impact scorches the surface, sending a thick cloud of black smoke billowing outward, obscuring the view in acrid haze.",
      },
      {
        id: "space_0",
        label: "Jump",
        icon: "🦘",
        key: " ",
        keyLabel: "Space",
        addendum:
          "The current controllable subject springs upward into the air.",
        finalPrompt:
          "整体为第一人称视角的科幻奇幻战斗漫游场景，第一人称主角在场景漫游，并根据环境切换风格一致但差异明显的武器或战斗工具，但都是枪械。画面强调第一视角移动、场景突变、武器切换、Boss 攻击和强烈破坏效果。攻击瞄准的敌人，会被击杀。 The current controllable subject springs upward into the air.",
      },
    ],
  },
  {
    id: "scholars_journal",
    label: "Scholar's Journal",
    description: "First-person scholar holding an open journal at golden hour",
    imageUrl: "/images/scholars_journal.jpg",
    prompt:
      "This is a first-person-view video from the perspective of a scholar holding an open journal with sketches and text. Golden hour atmosphere. The journal and the scholar's hands remain at the exact centre of the frame at constant size and distance. Neither the journal nor the camera moves on its own; arrow-key look-input is the only source of camera motion, orbiting around the stable hands only while held. With no event key pressed, the hands hold the book steady, fingers resting gently on the pages, ready to turn them or point at the drawings.",
    events: [
      {
        id: "1_0",
        label: "Glowing Pages",
        icon: "📖",
        key: "1",
        keyLabel: "1",
        addendum:
          "书页发光",
        finalPrompt:
          "The video presents a first-person view of a scholar holding an open journal, its pages filled with sketches and text, bathed in warm golden hour light. And suddenly, the book's pages begin to glow with an intense, ethereal luminescence, casting a soft radiance onto the scholar's hands. The light pulses gently, illuminating the intricate details of the drawings and text within the journal.",
      },
      {
        id: "2_0",
        label: "Magic Orb Attack",
        icon: "🔮",
        key: "2",
        keyLabel: "2",
        addendum:
          "魔法球攻击",
        finalPrompt:
          "The video presents a first-person view of a scholar's hands holding an open journal with sketches, bathed in golden hour light. And suddenly, a glowing magical sphere erupts from the scholar's palm, striking the journal pages with intense force. The impact sends a shockwave of arcane energy rippling through the air, causing the paper to flutter violently and casting sharp, pulsating shadows across the scholar's fingers.",
      },
      {
        id: "f_0",
        label: "Fox by the Ancient Columns",
        icon: "🐾",
        key: "f",
        keyLabel: "F",
        addendum:
          "The original focal subject remains the main subject, unchanged in pose and position, while a reddish-orange fox steps lightly between the fluted stone pillars nearby, pausing to sniff the sun-warmed marble before trotting toward the distant citadel walls.",
      },
      {
        id: "g_0",
        label: "Crimson Sunset Deepens",
        icon: "🌦️",
        key: "g",
        keyLabel: "G",
        addendum:
          "The golden hour light fades into a deep crimson twilight as the sky softens to bruised purple, casting the ancient marble pillars into long violet shadows while the scholar's hands remain steady in the warm glow.",
      },
      {
        id: "space_0",
        label: "Jump",
        icon: "🦘",
        key: " ",
        keyLabel: "Space",
        addendum:
          "The current controllable subject springs upward into the air.",
        finalPrompt:
          "This is a first-person-view video from the perspective of a scholar holding an open journal with sketches and text. Golden hour atmosphere. The journal and the scholar's hands remain at the exact centre of the frame at constant size and distance. Neither the journal nor the camera moves on its own; arrow-key look-input is the only source of camera motion, orbiting around the stable hands only while held. With no event key pressed, the hands hold the book steady, fingers resting gently on the pages, ready to turn them or point at the drawings. The current controllable subject springs upward into the air.",
      },
    ],
  },
  {
    id: "paraglider",
    label: "Paraglider",
    description: "First-person paraglider soaring above a green valley",
    imageUrl: "/images/paraglider.jpg",
    prompt:
      "This is a first-person-view video from the perspective of a paraglider pilot soaring high above a green valley. The pilot's legs and hands gripping the control toggles remain at the exact centre of the frame at constant size and distance. Neither the pilot nor the camera moves on its own; arrow-key look-input is the only source of camera motion, orbiting around the stable pilot only while held. With no event key pressed, the pilot's legs hang relaxed and the hands hold the toggles steady, ready to steer.",
    events: [
      {
        id: "f_0",
        label: "Eagle Soars Nearby",
        icon: "🐾",
        key: "f",
        keyLabel: "F",
        addendum:
          "The paraglider pilot remains the main subject, suspended high above the valley with legs and hands steady, while a massive golden eagle emerges from the sunlit mountain air to circle slowly to the left, its broad wings catching the thermal currents in wide, rhythmic sweeps that disturb nothing below.",
      },
      {
        id: "g_0",
        label: "Golden Hour Transition",
        icon: "🌦️",
        key: "g",
        keyLabel: "G",
        addendum:
          "The paraglider pilot remains the main subject, suspended high above the valley with legs and hands steady, as the bright, harsh blue daylight slowly mellows into the deep amber glow of sunset, casting long, warm shadows across the distant snow-capped peaks and painting the valley floor in soft, golden light.",
      },
      {
        id: "space_0",
        label: "Jump",
        icon: "🦘",
        key: " ",
        keyLabel: "Space",
        addendum:
          "The current controllable subject springs upward into the air.",
        finalPrompt:
          "This is a first-person-view video from the perspective of a paraglider pilot soaring high above a green valley. The pilot's legs and hands gripping the control toggles remain at the exact centre of the frame at constant size and distance. Neither the pilot nor the camera moves on its own; arrow-key look-input is the only source of camera motion, orbiting around the stable pilot only while held. With no event key pressed, the pilot's legs hang relaxed and the hands hold the toggles steady, ready to steer. The current controllable subject springs upward into the air.",
      },
    ],
  },
  {
    id: "candlelit_muse",
    label: "Candlelit Muse",
    description: "Third-person young woman resting her chin on her hand in a soft-lit bedroom",
    imageUrl: "/images/candlelit_muse.jpg",
    prompt:
      "This is a third-person-view video of a young woman with long dark hair resting her chin on her hand in a bedroom. Soft cinematic rendering style. The woman remains at the exact centre of the frame at constant size and distance. Neither the woman nor the camera moves on its own; arrow-key look-input is the only source of camera motion, orbiting around the stable woman only while held. With no event key pressed, the woman rests in a relaxed pose, her hand supporting her face and her gaze steady.",
    events: [
      {  // lab-selected
        id: "1_0",
        label: "Toying with Her Hair",
        icon: "💁‍♀️",
        key: "1",
        keyLabel: "1",
        addendum:
          "她缓慢地撩动她的头发，风情万种",
        finalPrompt:
          "The video presents a third-person view of a young woman with long dark hair, resting her chin on her hand in a softly lit bedroom. And suddenly, she slowly sweeps her fingers through her hair, tilting her head with a seductive, alluring grace. Her dark locks cascade over her shoulder as her fingers trace the curve of her neck, emphasizing a languid, intimate charm.",
      },
      {  // lab-selected
        id: "2_0",
        label: "Candlelight Glow",
        icon: "🕯️",
        key: "2",
        keyLabel: "2",
        addendum:
          "她拿着蜡烛，照亮她的脸，画面很温馨",
        finalPrompt:
          "The video presents a third-person view of a young woman with long dark hair, centered in a softly lit bedroom. And suddenly, she raises a flickering candle, bringing the warm glow close to her face to illuminate her features. The gentle light casts soft shadows across her skin, creating an intimate and cozy atmosphere.",
      },
      {
        id: "f_0",
        label: "A curious rabbit appears",
        icon: "🐾",
        key: "f",
        keyLabel: "F",
        addendum:
          "The original focal subject remains the main subject, unchanged in pose and position, while the woman remains at the exact centre of the frame at constant size and distance, her hand supporting her face and her gaze steady, as a small, curious cottontail rabbit peeks out from behind the bed frame. Its ears twitch and its nose quivers, sniffing the quiet air near the carpet.",
      },
      {
        id: "g_0",
        label: "Snow-covered winter interior",
        icon: "🌦️",
        key: "g",
        keyLabel: "G",
        addendum:
          "A heavy snowfall transforms the bedroom into a frosty winter interior, thick white flakes drifting down from unseen windows and dusting the wooden headboard and the woman's dark hair.",
      },
      {
        id: "space_0",
        label: "Jump",
        icon: "🦘",
        key: " ",
        keyLabel: "Space",
        addendum:
          "The current controllable subject springs upward into the air.",
        finalPrompt:
          "This is a third-person-view video of a young woman with long dark hair resting her chin on her hand in a bedroom. Soft cinematic rendering style. The woman remains at the exact centre of the frame at constant size and distance. Neither the woman nor the camera moves on its own; arrow-key look-input is the only source of camera motion, orbiting around the stable woman only while held. With no event key pressed, the woman rests in a relaxed pose, her hand supporting her face and her gaze steady. The current controllable subject springs upward into the air.",
      },
    ],
  },
  {
    id: "bar_charmer",
    label: "Bar Charmer",
    description: "Third-person silver-haired man in a dim bar, cinematic",
    imageUrl: "/images/bar_charmer.jpg",
    prompt:
      "This is a third-person-view video of a young man with spiky silver hair and a black tank top in a dimly lit bar. Cinematic atmosphere. The man remains at the exact centre of the frame at constant size and distance. Neither the man nor the camera moves on its own; arrow-key look-input is the only source of camera motion, orbiting around the stable subject only while held. With no event key pressed, the man sits relaxed with his shoulders bare and gaze steady, his expression calm and ready.",
    events: [
      {
        id: "1_0",
        label: "Casual Wave",
        icon: "👋",
        key: "1",
        keyLabel: "1",
        addendum:
          "主人公靠近镜头，保持慵懒微笑，抬手轻轻挠了挠凌乱的银灰色头发。发丝在烛光下微微散开，他低头看向镜头，像是在随意打招呼。",
        finalPrompt:
          "The video presents a third-person view of a young man with spiky silver hair and a black tank top, centered in a dimly lit bar with cinematic atmosphere. And suddenly, he leans forward toward the camera, maintaining a lazy smile while raising a hand to gently scratch his messy silver-grey hair. Strands catch the candlelight as they scatter slightly. He lowers his gaze directly into the lens, offering a casual, intimate greeting.",
      },
      {
        id: "2_0",
        label: "Raise a Glass",
        icon: "🥂",
        key: "2",
        keyLabel: "2",
        addendum:
          "主人公从旁边拿起一个精致酒杯，杯中映着柔和烛光。他把酒杯举到镜头前，微微一笑，像是在邀请镜头一起干杯。杯沿轻轻靠近镜头，画面中闪过玻璃反光和温暖灯影。",
        finalPrompt:
          "The video presents a third-person view of a young man with spiky silver hair and a black tank top, standing center-frame in a dimly lit bar with cinematic atmosphere. And suddenly, he lifts an exquisite wine glass filled with soft candlelight directly toward the lens, offering a warm smile as if inviting a toast. The rim of the glass approaches the camera, causing a bright flash of glass reflection and warm light shadows to sweep across the frame.",
      },
      {
        id: "3_0",
        label: "Leaning Smile",
        icon: "😏",
        key: "3",
        keyLabel: "3",
        addendum:
          "男主靠近镜头，身体微微前倾，直接对着镜头露出温柔又自信的微笑。烛光映在他的眼睛和银灰色发丝上，背景保持昏暗华丽的室内氛围，画面显得亲密而浪漫。",
        finalPrompt:
          "The video presents a third-person view of a young man with spiky silver hair and a black tank top, standing center-frame in a dimly lit, cinematic bar. And suddenly, he leans forward toward the lens, his body tilting gently as he offers a warm, confident smile directly to the viewer. Candlelight catches the silver strands of his hair and glints in his eyes, while the dark, ornate background remains softly blurred. The intimate proximity creates a romantic atmosphere, with the warm glow highlighting his facial features against the shadowy interior.",
      },
      {
        id: "f_0",
        label: "Fox at the bar corner",
        icon: "🐾",
        key: "f",
        keyLabel: "F",
        addendum:
          "The original focal subject remains the main subject, unchanged in pose and position, while the man remains at the exact centre of the frame at constant size and distance, his relaxed posture and steady gaze unchanged, while a sleek red fox slips quietly along the dark wood floor to the far right corner of the bar and pauses, its brush twitching as it watches the room.",
      },
      {
        id: "g_0",
        label: "Bar transforms to library",
        icon: "🌦️",
        key: "g",
        keyLabel: "G",
        addendum:
          "The man remains at the exact centre of the frame at constant size and distance, his relaxed posture and steady gaze unchanged, while the dim bar dissolves around him into a vast, hushed grand library, its walls now rising floor to ceiling with shelves of leather-bound volumes, the floor becoming worn hardwood runners, and the ambient lighting shifting to a warm, golden glow filtering from tall windows.",
      },
      {
        id: "space_0",
        label: "Jump",
        icon: "🦘",
        key: " ",
        keyLabel: "Space",
        addendum:
          "The current controllable subject springs upward into the air.",
        finalPrompt:
          "This is a third-person-view video of a young man with spiky silver hair and a black tank top in a dimly lit bar. Cinematic atmosphere. The man remains at the exact centre of the frame at constant size and distance. Neither the man nor the camera moves on its own; arrow-key look-input is the only source of camera motion, orbiting around the stable subject only while held. With no event key pressed, the man sits relaxed with his shoulders bare and gaze steady, his expression calm and ready. The current controllable subject springs upward into the air.",
      },
    ],
  },
  {
    id: "wonders_tour",
    label: "Wonders Tour",
    description: "First-person journey hopping from the Great Wall across world landmarks",
    imageUrl: "/images/wonders_tour.jpg",
    prompt:
      "This is a first-person-view video of a sweeping vista along the Great Wall of China, with the ancient stone rampart and watchtowers winding across lush green mountain ridges. Crisp storybook rendering style. The stone wall remains at the exact centre of the frame at constant size and distance. Neither the wall nor the camera moves on its own; arrow-key look-input is the only source of camera motion, orbiting around the stable wall only while held. With no event key pressed, the scene remains still and static, presenting the enduring architecture against the rolling hills.",
    events: [
      {  // lab-selected
        id: "1_0",
        label: "Pyramids of Giza",
        icon: "🐫",
        key: "1",
        keyLabel: "1",
        addendum:
          "画面被薄雾覆盖，雾散后到达埃及金字塔前。第一人称视角踩过金色沙地，仰望巨大的石块结构，远处骆驼队缓慢经过，阳光让沙漠泛起炽热光芒。",
      },
      {  // lab-selected
        id: "2_0",
        label: "West Lake",
        icon: "⛵",
        key: "2",
        keyLabel: "2",
        addendum:
          "云雾逐渐化为湖面薄雾，场景转到杭州西湖。第一人称沿着湖边石板路前行，湖水清澈平静，远处是断桥、亭台和层叠青山，柳枝随风轻摆，水面倒映着天空和古典建筑。",
      },
      {  // lab-selected
        id: "3_0",
        label: "Eiffel Tower",
        icon: "🗼",
        key: "3",
        keyLabel: "3",
        addendum:
          "视角继续前进，水面反光变成城市灯影，转场到法国埃菲尔铁塔下。第一人称穿过巴黎广场，抬头看见铁塔直入蓝天，周围游客、喷泉和街道建筑形成浪漫城市氛围。",
      },
      {  // lab-selected
        id: "4_0",
        label: "Mount Fuji",
        icon: "🗻",
        key: "4",
        keyLabel: "4",
        addendum:
          "夕阳光芒扩散，来到日本富士山脚下。第一人称沿着樱花小路前进，粉色花瓣随风飘落，远处富士山覆盖白雪，湖面倒映着山影和天空。",
      },
      {  // lab-selected
        id: "5_0",
        label: "Taj Mahal",
        icon: "🕌",
        key: "5",
        keyLabel: "5",
        addendum:
          "镜头穿过一道光影，来到印度泰姬陵前。第一人称沿着水池中轴线向前移动，白色大理石宫殿倒映在水面上，花园、拱门和远处飞鸟让场景显得宁静庄严。",
      },
      {  // lab-selected
        id: "6_0",
        label: "Christ the Redeemer",
        icon: "⛰️",
        key: "6",
        keyLabel: "6",
        addendum:
          "画面被水雾吞没，转化到巴西基督像所在的山顶。第一人称沿观景平台行走，脚下是里约城市与海湾，巨大的基督像展开双臂，云层从身边缓缓飘过。",
      },
      {  // lab-selected
        id: "7_0",
        label: "Golden Gate Bridge",
        icon: "🌉",
        key: "7",
        keyLabel: "7",
        addendum:
          "最后画面来到美国旧金山金门大桥。第一人称沿着桥面人行道向前移动，橙红色桥塔高耸在海雾之中，钢索向远处延伸，脚下是海湾与来往船只，远处城市天际线若隐若现，旅程在壮阔的桥梁景观中结束。",
      },
      {
        id: "f_0",
        label: "Forest Fox Appears",
        icon: "🐾",
        key: "f",
        keyLabel: "F",
        addendum:
          "The original focal subject remains the main subject, unchanged in pose and position, while the ancient stone rampart remains at the exact centre of the frame at constant size and distance, while a vibrant red fox darts across the sunlit grassy ridge nearby, its bushy tail twitching as it pauses to watch the distant watchtowers.",
      },
      {
        id: "g_0",
        label: "Winter Snowscape",
        icon: "🌦️",
        key: "g",
        keyLabel: "G",
        addendum:
          "The ancient stone rampart remains at the exact centre of the frame at constant size and distance, now winding across silent white mountain ridges instead of lush green foliage, with snow dusting the watchtowers and blanketing the foreground terrain.",
      },
      {
        id: "space_0",
        label: "Jump",
        icon: "🦘",
        key: " ",
        keyLabel: "Space",
        addendum:
          "The character jumps high into the air.",
        finalPrompt:
          "This is a first-person-view video of a sweeping vista along the Great Wall of China, with the ancient stone rampart and watchtowers winding across lush green mountain ridges. Crisp storybook rendering style. The stone wall remains at the exact centre of the frame at constant size and distance. Neither the wall nor the camera moves on its own; arrow-key look-input is the only source of camera motion, orbiting around the stable wall only while held. With no event key pressed, the scene remains still and static, presenting the enduring architecture against the rolling hills. The character jumps high into the air.",
      },
    ],
  },
];
