// Transcript -> structured visit record, via Claude.
//
// Deliberately does NOT persist anything server-side. Saving is a client-side action
// into localStorage (see lib/localStore.ts), so Regenerate can be hit repeatedly
// without accumulating anything here.
//
// No login on this build. That changes the trust model for two inputs that used to be
// server-fetched from the caller's own rows:
//   - specialty: now client-supplied, validated against the known SPECIALTIES list.
//   - previousRx: now client-supplied text, length-capped. This was deliberately
//     server-side before, scoped to "this doctor's own past visit", so a client
//     couldn't inject fake history into the prompt. With no database there's no
//     alternative — acceptable for one trusted user behind a Vercel-level password,
//     worth reinstating if this gets a real backend.
import { NextResponse, type NextRequest } from "next/server";

import { StructureError, structureTranscript } from "@/lib/claude";
import { clientIp, limitStructure } from "@/lib/ratelimit";
import { SPECIALTIES } from "@/types/prescription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Roughly an hour of continuous dictation. Bounds cost and stops a runaway client from
// posting something enormous.
const MAX_TRANSCRIPT_CHARS = 20_000;
// A previous visit rendered by formatPreviousRx is normally a few hundred chars; this
// is a generous ceiling against an oversized or adversarial body.
const MAX_PREVIOUS_RX_CHARS = 4_000;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    transcript?: unknown;
    patientName?: unknown;
    specialty?: unknown;
    previousRx?: unknown;
  };

  const transcript = typeof body.transcript === "string" ? body.transcript.trim() : "";
  if (!transcript) {
    return NextResponse.json({ error: "There's nothing to structure — no speech was captured." }, { status: 400 });
  }
  if (transcript.length > MAX_TRANSCRIPT_CHARS) {
    return NextResponse.json({ error: "That dictation is too long to process." }, { status: 400 });
  }
  const patientName = typeof body.patientName === "string" ? body.patientName : undefined;

  const specialty =
    typeof body.specialty === "string" && (SPECIALTIES as readonly string[]).includes(body.specialty)
      ? body.specialty
      : null;

  const previousRx =
    typeof body.previousRx === "string" && body.previousRx.trim()
      ? body.previousRx.trim().slice(0, MAX_PREVIOUS_RX_CHARS)
      : null;

  // Validate before rate-limiting so a malformed request doesn't burn quota.
  const rl = await limitStructure(clientIp(req));
  if (!rl.ok) return NextResponse.json({ error: rl.reason }, { status: 429 });

  try {
    const structured = await structureTranscript({ transcript, patientName, specialty, previousRx });
    return NextResponse.json({ structured });
  } catch (e) {
    if (e instanceof StructureError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "Could not structure the dictation. Please try again." }, { status: 502 });
  }
}
