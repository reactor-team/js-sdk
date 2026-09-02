import { NextRequest, NextResponse } from "next/server";

/**
 * `/api/upsample` — the optional episode writer.
 *
 * POST `{ idea, sceneCount }` and an OpenAI-compatible LLM (your own key,
 * server-side only) turns the idea into exactly `sceneCount` scene prompts
 * written the way fast-h3 renders best when scenes are chained: fully
 * self-contained, and every scene after the first opening on a described
 * hard cut. GET reports whether the writer is configured, so the composer
 * can offer the button only when it works.
 *
 * Without `OPENAI_API_KEY`, POST answers 503 and the UI falls back to
 * hand-written scenes — the composer carries the same writing rules as
 * guidance text.
 */

const MAX_SCENES = 6;
const MAX_IDEA_CHARS = 500;
// fast-h3's server-side cap on one prompt; the LLM is told 700 to leave
// headroom for its unreliable counting, and we truncate anyway.
const MAX_PROMPT_CHARS = 800;
const TARGET_PROMPT_CHARS = 700;

const SYSTEM_PROMPT = `\
You are the head writer of a short AI-generated video episode. You turn one
rough idea into exactly {sceneCount} scene prompt(s) for a model that
generates short video clips with synchronized audio.

HOW THE VIDEO MODEL WORKS (hard constraints):
- Each scene becomes ONE clip, and the model reads ONLY that scene's text —
  it never sees the other scene prompts. Every scene prompt must be fully
  self-contained and re-describe the entire setting, subjects, lighting,
  palette, mood, and style — even when nothing changed from the previous
  scene. Anything you omit will vanish or mutate between scenes.
- The episode's scenes are rendered as ONE continuous video: each scene
  begins on the exact final frame of the scene before it. Because of that,
  EVERY SCENE AFTER THE FIRST MUST OPEN ON A HARD CUT — a new shot with a
  clearly different camera angle, distance, or location — and its prompt
  must describe that new shot in full, as if the camera were set up fresh.
  Open the prompt with the cut itself, e.g. "Hard cut to a wide shot of
  ...", "Cut to: inside the lighthouse, a close-up of ...".
- NEVER write a scene that extends the previous scene's shot. No "the
  camera continues", "still on her face", "the shot lingers" — holding one
  take across scenes makes the picture smear, repeat, and degrade scene
  over scene, while a clean cut keeps every scene sharp.
- Even across cuts the episode stays one story: re-describe the same
  setting and subjects verbatim enough that they read as the same place
  and cast, and change only what the story moves.
- Each scene prompt must be under {targetChars} characters. Hard limit;
  prefer cutting adjectives over cutting subjects or setting.
- The model renders picture AND sound, including clear spoken language.
  When the idea involves someone speaking, name who speaks and give the
  exact words in quotes, and describe the voice's tone.
- End each scene prompt with one short clause of soundscape (ambience,
  music mood, or effects) alongside any dialogue.
- Describe only what the camera sees and the microphone hears: no text
  overlays, no UI, no scene numbers, no camera jargon the model cannot show.

Reply with ONLY this JSON, nothing else:
{"title": "short episode title",
 "scenes": [{"prompt": "self-contained scene description..."}]}
The "scenes" array must hold exactly {sceneCount} entries.`;

function config() {
  const apiKey = process.env.OPENAI_API_KEY;
  return {
    apiKey,
    baseUrl: (
      process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"
    ).replace(/\/$/, ""),
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
  };
}

export async function GET() {
  return NextResponse.json(
    { enabled: Boolean(config().apiKey) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: NextRequest) {
  const { apiKey, baseUrl, model } = config();
  if (!apiKey) {
    return NextResponse.json(
      { error: "No OPENAI_API_KEY configured — write the scenes by hand." },
      { status: 503 },
    );
  }

  let idea = "";
  let sceneCount = 3;
  try {
    const body = (await request.json()) as {
      idea?: string;
      sceneCount?: number;
    };
    idea = String(body.idea ?? "")
      .trim()
      .slice(0, MAX_IDEA_CHARS);
    sceneCount = Math.min(
      MAX_SCENES,
      Math.max(1, Number(body.sceneCount) || 3),
    );
  } catch {
    return NextResponse.json(
      { error: "Malformed request body." },
      { status: 400 },
    );
  }
  if (!idea) {
    return NextResponse.json({ error: "The idea is empty." }, { status: 400 });
  }

  const system = SYSTEM_PROMPT.replaceAll(
    "{sceneCount}",
    String(sceneCount),
  ).replaceAll("{targetChars}", String(TARGET_PROMPT_CHARS));
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        // The random tag makes retries distinct requests — gateways cache
        // identical ones and would echo a failed reply straight back.
        {
          role: "user",
          content: `Idea: ${idea}\n\n[request ${crypto.randomUUID().slice(0, 8)}]`,
        },
      ],
      temperature: 0.8,
      max_tokens: 1800,
      response_format: { type: "json_object" },
    }),
  });
  if (!response.ok) {
    return NextResponse.json(
      { error: `The writing endpoint returned ${response.status}.` },
      { status: 502 },
    );
  }

  try {
    const data = (await response.json()) as {
      choices: { message: { content: string | null } }[];
    };
    const parsed = JSON.parse(data.choices[0]?.message?.content ?? "{}") as {
      title?: string;
      scenes?: { prompt?: string }[];
    };
    const scenes = (parsed.scenes ?? [])
      .map((scene) => sanitize(String(scene?.prompt ?? "")))
      .filter(Boolean)
      .slice(0, sceneCount);
    if (scenes.length === 0) throw new Error("no usable scenes");
    return NextResponse.json({
      title: String(parsed.title ?? idea.slice(0, 60)).trim(),
      scenes,
    });
  } catch {
    return NextResponse.json(
      {
        error: "The writer's reply was unusable — try again or write by hand.",
      },
      { status: 502 },
    );
  }
}

/** Collapse whitespace and fit under the model's prompt cap, ending clean. */
function sanitize(prompt: string): string {
  const collapsed = prompt.split(/\s+/).join(" ").trim();
  if (collapsed.length <= MAX_PROMPT_CHARS) return collapsed;
  const head = collapsed.slice(0, MAX_PROMPT_CHARS);
  const boundary = Math.max(
    head.lastIndexOf(". "),
    head.lastIndexOf("! "),
    head.lastIndexOf("? "),
  );
  return boundary > MAX_PROMPT_CHARS / 2
    ? head.slice(0, boundary + 1).trim()
    : head.trim();
}
