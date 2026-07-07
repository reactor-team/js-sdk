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
];
