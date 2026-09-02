import { NextResponse } from "next/server";

// The account-qualified model this example drives; the minted JWT is scoped
// to it. This MUST equal the name the typed provider connects with — a
// scope that doesn't match mints fine but 403s on connect().
const MODEL_NAME = "reactor/fast-h3";
// Sessions one token may ever create (closed sessions still count).
const MAX_SESSIONS = 10;
// 1h keeps a memoized token — and its session budget — from outliving a visit.
const TOKEN_LIFETIME_SECONDS = 60 * 60;

export async function GET() {
  const apiKey = process.env.REACTOR_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "REACTOR_API_KEY not set" },
      { status: 500 },
    );
  }

  const res = await fetch("https://api.reactor.inc/tokens", {
    method: "POST",
    headers: { "Reactor-API-Key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      expires_after: TOKEN_LIFETIME_SECONDS,
      authorization_details: [
        {
          type: "session",
          resources: { models: { match: [MODEL_NAME] } },
          constraints: { max_sessions: MAX_SESSIONS },
        },
      ],
    }),
  });
  if (!res.ok) {
    return NextResponse.json(
      { error: `Reactor returned ${res.status}` },
      { status: 502 },
    );
  }

  // Hand the client expires_at so it can memoize the token itself; no-store
  // keeps the browser's HTTP cache out of it entirely. A session can only
  // be operated by the exact token that created it, and the browser cache
  // can drop an entry without warning — a dropped-then-refetched token has
  // no sessions bound and 403s every later hop the session makes.
  const { jwt, expires_at } = (await res.json()) as {
    jwt: string;
    expires_at: number;
  };
  return NextResponse.json(
    { jwt, expires_at },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
