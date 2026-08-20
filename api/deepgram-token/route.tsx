// Mints a short-lived Deepgram access token for the browser.
//
// This endpoint exists solely so DEEPGRAM_API_KEY never reaches the client. The
// browser gets a scoped token that is only good for opening one stream; the key
// itself stays on the server.
//
// No login on this build — rate-limited by IP instead. See lib/ratelimit.ts for why
// the global cap (not this per-IP one) is the real cost ceiling.
import { NextResponse, type NextRequest } from "next/server";

import { mintDeepgramToken } from "@/lib/deepgram-server";
import { clientIp, limitTokenMint } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const rl = await limitTokenMint(clientIp(req));
  if (!rl.ok) return NextResponse.json({ error: rl.reason }, { status: 429 });

  try {
    const grant = await mintDeepgramToken();
    return NextResponse.json(grant, {
      // Short-lived credential — never let it sit in a cache anywhere.
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    // mintDeepgramToken already logged the detail server-side.
    return NextResponse.json({ error: "Could not start transcription. Please try again." }, { status: 502 });
  }
}
