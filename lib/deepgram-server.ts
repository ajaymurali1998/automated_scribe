// SERVER-ONLY Deepgram code. Kept in its own module so DEEPGRAM_API_KEY can never
// be pulled into a client bundle by an stray import.
//
// Confirmed against Deepgram's docs while planning:
//   - The grant body field is `ttl_seconds`. One Deepgram doc page shows `ttl`,
//     which is wrong and silently falls back to the 30s default.
//   - Max TTL is 3600s.
//   - The API key needs at least MEMBER permission; a lesser key gets
//     FORBIDDEN / "Insufficient permissions."

const GRANT_URL = "https://api.deepgram.com/v1/auth/grant";

// 60s is plenty. The token only has to survive the handshake — once the socket is
// open Deepgram keeps it open regardless of expiry — but this leaves slack for a
// slow network or a doctor who takes a moment over the mic permission prompt.
export const TOKEN_TTL_SECONDS = 60;

export type DeepgramGrant = { access_token: string; expires_in: number };

export async function mintDeepgramToken(): Promise<DeepgramGrant> {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) throw new Error("DEEPGRAM_API_KEY is not set");

  const res = await fetch(GRANT_URL, {
    method: "POST",
    headers: {
      Authorization: `Token ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ttl_seconds: TOKEN_TTL_SECONDS }),
    cache: "no-store",
  });

  if (!res.ok) {
    // Deliberately not echoed to the client — Deepgram's error body can name the
    // key or the project. Log server-side, return something generic upstream.
    const detail = await res.text().catch(() => "");
    console.error(`[deepgram] grant failed ${res.status}: ${detail.slice(0, 300)}`);
    throw new Error(`deepgram grant failed (${res.status})`);
  }

  const json = (await res.json()) as Partial<DeepgramGrant>;
  if (!json.access_token) throw new Error("deepgram grant returned no access_token");
  return { access_token: json.access_token, expires_in: json.expires_in ?? TOKEN_TTL_SECONDS };
}
