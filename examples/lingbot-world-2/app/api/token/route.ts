import { NextResponse } from "next/server";

// Exchanges the server-side REACTOR_API_KEY for a short-lived session JWT.
// Keeping the exchange on the server means the API key never ships to the
// browser — the client only ever sees the JWT.
export async function POST() {
  const apiKey = process.env.REACTOR_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "REACTOR_API_KEY is not configured" },
      { status: 500 },
    );
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_COORDINATOR_URL || "https://api.reactor.inc";

  const response = await fetch(`${baseUrl}/tokens`, {
    method: "POST",
    headers: { "Reactor-API-Key": apiKey },
  });

  if (!response.ok) {
    const body = await response.text();
    return NextResponse.json(
      { error: `Token request failed: ${response.status} ${body}` },
      { status: response.status },
    );
  }

  const { jwt } = await response.json();
  return NextResponse.json({ jwt });
}
