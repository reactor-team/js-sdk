import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const headerKey = request.headers.get("Reactor-API-Key");
  const apiKey =
    headerKey ||
    process.env.REACTOR_API_KEY ||
    process.env.NEXT_PUBLIC_REACTOR_API_KEY;

  let baseUrl: string | undefined;
  try {
    const body = await request.json();
    baseUrl = body?.baseUrl;
  } catch {
    // existing demos call POST /api/token with no body
  }
  baseUrl =
    baseUrl ||
    process.env.NEXT_PUBLIC_COORDINATOR_URL ||
    "https://api.reactor.inc";

  if (!apiKey) {
    return NextResponse.json(
      { error: "REACTOR_API_KEY is not configured" },
      { status: 500 },
    );
  }

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
