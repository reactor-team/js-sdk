import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

// Tail the activity log that watch_activity.py appends to (coordinator/activity.log),
// so the in-app ActivityTicker can show the same stream the headless listener sees.
// This is the "watch_activity writes into the app" bridge — the browser can't read a
// local file, but this server route can, and returns the last lines as JSON.
export const dynamic = "force-dynamic"; // never cache; always read the live file

export async function GET() {
  const file = path.join(process.cwd(), "coordinator", "activity.log");
  try {
    const txt = await readFile(file, "utf-8");
    const lines = txt.split("\n").map((l) => l.trim()).filter(Boolean).slice(-60);
    return NextResponse.json({ lines, ok: true });
  } catch {
    // No file yet (watch_activity not running) — return empty, not an error.
    return NextResponse.json({ lines: [], ok: false });
  }
}
