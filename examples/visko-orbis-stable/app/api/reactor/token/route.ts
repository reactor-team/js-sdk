import { NextResponse } from "next/server";

// The model this app drives. The minted JWT is scoped to it: the token
// can create sessions for this model only, and can act only on the
// sessions it created — nothing else on the account.
const MODEL_NAME = "reactor/visko-orbis-stable";

// Session budget for one token — how many sessions it may ever create
// (closed sessions still count). A token is cached and REUSED for its whole
// lifetime (see below), so leave room for a burst of reconnects.
const MAX_SESSIONS = 10;

// How long we ask Reactor to make the JWT valid for (the server caps
// this at 6h). One hour keeps a cached token — and its remaining session
// budget — from outliving a normal visit.
const TOKEN_LIFETIME_SECONDS = 60 * 60;

// Safety margin on the cache lifetime so an in-flight request doesn't
// race with the real expiry.
const CACHE_SKEW_SECONDS = 60;

// Mint a session-scoped Reactor JWT and return it with a `Cache-Control` header
// that lets the browser REUSE the same token for its whole lifetime.
//
// ⚠️ Reuse is REQUIRED, not just a cache optimization. The Coordinator binds
// each session to the exact token (JWT id) that created it: a scoped token may
// only act on sessions it created ITSELF. If the browser re-mints a fresh JWT
// between the create call and a follow-up (GET session, ICE servers, DELETE),
// the new token did not "create" that session and is rejected:
//   403 "this token is session-scoped and is not authorized for this resource"
// So the `getJwt` resolver in the client MUST yield the SAME token across every
// coordinator hop of one session. Returning `private, max-age=<token lifetime>`
// makes the browser's HTTP cache serve the identical JWT on every call —
// no localStorage, no JWT parsing in client code, and the JTI stays constant.
// (Do NOT switch this to no-store: that re-mints per hop and breaks the binding.)
//
// Why GET and not POST?
//   POST responses aren't cached by browsers. GET lets the HTTP cache serve
//   repeat calls transparently. The route still POSTs to Reactor internally.
//
// Why `private`?
//   Keeps shared caches (CDNs, corporate proxies) from storing a per-user JWT.
//
// Why derive `max-age` from `expires_at`?
//   Reactor decides the actual token lifetime (capped server-side). Reading
//   `expires_at` keeps the cache window in sync with what was granted, minus
//   a one-minute safety skew.
//
// Why `authorization_details`?
//   This is what downscopes the token. Without it the JWT carries the
//   API key's full user-level access; with it the browser only ever
//   holds a credential for MODEL_NAME sessions it started itself, so a
//   leaked token is a bounded loss instead of an account key.
export async function GET() {
  const apiKey = process.env.REACTOR_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "REACTOR_API_KEY is not set on the server" },
      { status: 500 },
    );
  }

  const res = await fetch("https://api.reactor.inc/tokens", {
    method: "POST",
    headers: {
      "Reactor-API-Key": apiKey,
      "Content-Type": "application/json",
    },
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
      { error: `Reactor /tokens returned ${res.status}` },
      { status: 502 },
    );
  }

  const { jwt, expires_at } = (await res.json()) as {
    jwt: string;
    expires_at: number;
  };

  const nowSeconds = Math.floor(Date.now() / 1000);
  const maxAge = Math.max(0, expires_at - nowSeconds - CACHE_SKEW_SECONDS);

  return NextResponse.json(
    { jwt },
    {
      headers: {
        "Cache-Control": `private, max-age=${maxAge}`,
      },
    },
  );
}
