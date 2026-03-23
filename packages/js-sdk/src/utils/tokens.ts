import { DEFAULT_BASE_URL } from "../core/Reactor";

/**
 * ⚠️ INSECURE: Fetches a JWT token directly from the client.
 *
 * WARNING: This function exposes your API key in client-side code.
 * Only use this for local development or testing purposes.
 * In production, call /tokens from your server and pass the JWT to your frontend.
 *
 * @param apiKey - Your Reactor API key (will be exposed in client code!)
 * @param apiUrl - Optional API URL, defaults to production
 * @returns string containing the JWT token
 */
export async function fetchInsecureToken(
  apiKey: string,
  apiUrl: string = DEFAULT_BASE_URL
): Promise<string> {
  console.warn(
    "[Reactor] ⚠️ SECURITY WARNING: fetchInsecureToken() exposes your API key in client-side code. " +
      "This should ONLY be used for local development or testing. " +
      "In production, fetch tokens from your server instead."
  );

  const response = await fetch(`${apiUrl}/tokens`, {
    method: "GET",
    headers: {
      "Reactor-API-Key": apiKey,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create token: ${response.status} ${error}`);
  }

  const { jwt } = await response.json();

  return jwt;
}
