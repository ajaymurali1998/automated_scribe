// Turns a raw dictation transcript into a validated prescription object.
//
// Uses the Messages API's structured-output format rather than asking for JSON in
// the prompt and parsing it defensively. That matters here: generation is
// constrained to PrescriptionSchema and the SDK validates the result on parse, so
// a malformed prescription is a caught error rather than a half-populated form the
// doctor might sign off on.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { PrescriptionSchema, normalizeInvestigationType, type StructuredRx } from "@/types/prescription";
import { RX_SYSTEM_PROMPT, buildStructurePrompt } from "@/lib/prompts";

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

export const MODEL = "claude-sonnet-5";

// A prescription is a small payload, but adaptive thinking spends output tokens on
// working out garbled drug names — leave room for it.
export const MAX_TOKENS = 8_000;

// Tunable: drop to "medium" if the doctor finds the wait too long. Accuracy on drug
// names is the whole product, so this starts high.
export const EFFORT = "high" as const;

// Abort before the route's maxDuration so a hang surfaces as a clear error rather
// than an opaque function kill.
export const TIMEOUT_MS = 50_000;

export class StructureError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export type StructureInput = {
  transcript: string;
  patientName?: string;
  /** The doctor's specialty. No backend on this build — supplied by the client and
   *  validated against SPECIALTIES in the route handler. */
  specialty?: string | null;
  /** A previous visit, pre-rendered by formatPreviousRx. Client-supplied and
   *  length-capped in the route handler — see the trust-model note there. */
  previousRx?: string | null;
};

export async function structureTranscript(input: StructureInput): Promise<StructuredRx> {
  const today = new Date().toISOString().slice(0, 10);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const t0 = Date.now();

  try {
    const response = await getClient().messages.parse(
      {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        thinking: { type: "adaptive" },
        output_config: {
          effort: EFFORT,
          format: zodOutputFormat(PrescriptionSchema),
        },
        system: RX_SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildStructurePrompt({ ...input, today }) }],
      },
      { signal: controller.signal }
    );

    // Counts and timing only. Never log the transcript or the record itself — that is
    // patient data and Vercel logs are not a place for it.
    const out = response.parsed_output;
    console.log(
      `[structure] ${Date.now() - t0}ms stop_reason=${response.stop_reason} ` +
        `meds=${out?.medications.length ?? "-"} inv=${out?.investigations.length ?? "-"} ` +
        `unclear=${out?.unclear_segments.length ?? "-"}`
    );

    if (response.stop_reason === "refusal") {
      throw new StructureError("The model declined to process this dictation.", 422);
    }
    if (response.stop_reason === "max_tokens") {
      throw new StructureError("The prescription was too long to structure. Try a shorter dictation.", 422);
    }
    if (!out) {
      throw new StructureError("Could not structure the dictation. Please try again.", 502);
    }

    // The investigation type is an unconstrained string on the wire (see the comment on
    // InvestigationSchema), so pin it to a known value before it reaches the UI.
    return {
      ...out,
      investigations: out.investigations.map((inv) => ({
        ...inv,
        type: normalizeInvestigationType(inv.type),
      })),
    };
  } catch (e) {
    if (e instanceof StructureError) throw e;

    const err = e as { name?: string; message?: string };
    console.error(`[structure] FAILED after ${Date.now() - t0}ms: ${err?.message}`);

    if (err?.name === "AbortError" || /abort/i.test(String(err?.message))) {
      throw new StructureError("Structuring timed out. Please try again.", 504);
    }
    throw new StructureError("Could not structure the dictation. Please try again.", 502);
  } finally {
    clearTimeout(timer);
  }
}
