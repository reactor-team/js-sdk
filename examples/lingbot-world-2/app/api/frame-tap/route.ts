import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

// Receives a JPEG grabbed from the LIVE browser video and writes it to the frame
// file the AI director watches. On the CLOUD path the generated video only exists
// in the browser (WebRTC → <video>), never on disk, so this route is the bridge
// that gives the director REAL, evolving frames instead of a frozen scene still.
//
// The destination is the same path everything else uses: LINGBOT_FRAME_TAP if set,
// else coordinator/frame.png (resolved from the app's working dir). Written
// atomically (tmp + rename) so the director never reads a half-written file —
// mirrors local_server/engine.py's frame tap.

export const runtime = "nodejs"; // needs fs; not edge

function framePath(): string {
  return (
    process.env.LINGBOT_FRAME_TAP ||
    path.join(process.cwd(), "coordinator", "frame.png")
  );
}

export async function POST(req: Request): Promise<NextResponse> {
  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length === 0) {
    return NextResponse.json({ error: "empty body" }, { status: 400 });
  }
  const dest = framePath();
  const tmp = `${dest}.tmp`;
  try {
    await fs.writeFile(tmp, buf);
    await fs.rename(tmp, dest); // atomic swap so the watcher sees a whole frame
  } catch (e) {
    return NextResponse.json(
      { error: `write failed: ${(e as Error).message}` },
      { status: 500 },
    );
  }
  // Optional DEBUG archive: keep EVERY captured frame (not just the latest) so you
  // can replay exactly what the director saw. Opt-in via LINGBOT_FRAME_ARCHIVE=<dir>;
  // names are epoch-ms so they sort chronologically. Best-effort — never fails the tap.
  const archiveDir = process.env.LINGBOT_FRAME_ARCHIVE;
  if (archiveDir) {
    try {
      await fs.mkdir(archiveDir, { recursive: true });
      await fs.writeFile(path.join(archiveDir, `frame_${Date.now()}.jpg`), buf);
    } catch {
      /* archive is best-effort; a full disk must not break live directing */
    }
  }
  return NextResponse.json({ ok: true, bytes: buf.length });
}
