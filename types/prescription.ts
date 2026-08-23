// The visit-record schema. This Zod object is the SINGLE source of truth: it is
// handed to Claude as a structured-output format (so generation is constrained to
// it), used to validate what comes back, and inferred into the TS types the UI and
// PDF render from. Change it here and everything downstream follows.
//
// The .describe() text is not decoration — it is serialized into the JSON Schema the
// model receives, so it is where per-field guidance belongs. Keeping it here rather
// than duplicating a schema block in the system prompt means the two can never drift.
// (lib/prompts.ts's OUTPUT SCHEMA block is the one deliberate exception — see the
// comment there for why it still needs to exist and stay in sync with this file.)
//
// IMPORTANT: descriptive fields use "" (empty string) for "not stated", NOT .nullable().
// This isn't a style preference — Anthropic's structured-output compiler hard-caps a
// schema at 16 nullable/union-typed fields ("Schemas contains too many parameters with
// union types... this causes exponential compilation cost"), and this schema blew past
// that (22) once investigations/referral/care_plan/noise were added. Every UI read
// already does `value ?? ""`, and every truthiness check (Boolean(review_flag), the
// `?` renders, formatPreviousRx's .filter(Boolean)) treats "" and null identically
// since both are falsy — so this is a free conversion, not a behavior change. The one
// field that keeps real .nullable() is the top-level `referral`: "no referral at all"
// is a state the UI branches on structurally, not just an empty value.
import { z } from "zod";

export const MedicationSchema = z.object({
  name: z
    .string()
    .describe(
      "Drug name as an Indian doctor would write it — brand name if the doctor said a brand (Dolo, Pan-D, Telma), generic otherwise. Correct obvious speech-recognition damage."
    ),
  heard_as: z
    .string()
    .describe(
      'What the doctor\'s speech literally sounded like BEFORE correction, e.g. "met for men", "acithral" -- ONLY when you corrected a real speech-recognition error in the name. Empty string when the name was already clear and needed no correction. Never fill this from dose/frequency confusion, only from the name itself being misheard.'
    ),
  strength: z.string().describe('Dose strength with unit, e.g. "500mg", "10ml", "40 units". Empty string if not stated.'),
  form: z
    .string()
    .describe('Dosage form: "Tablet", "Capsule", "Syrup", "Injection", "Drops", "Cream", "Ointment", etc. Empty string if not stated or inferable.'),
  frequency: z
    .string()
    .describe('Expanded frequency with the Indian shorthand in parentheses, e.g. "Twice daily (BD)", "At bedtime (HS)", "As needed (SOS)". Empty string if not stated.'),
  timing: z.string().describe('"Before food", "After food", or empty string if not stated.'),
  duration: z.string().describe('How long to take it, e.g. "5 days", "3 weeks", "Continue". Empty string if not stated.'),
  instructions: z.string().describe("Any extra instruction specific to this drug, else empty string."),
  carried_forward: z
    .boolean()
    .describe(
      "true ONLY when this item came from the previous prescription because the doctor referenced it (e.g. 'continue the same') rather than dictating it in this visit. false for anything actually said this visit."
    ),
  review_flag: z
    .string()
    .describe(
      "A CRISP 2-4 word label ONLY when this item is ambiguous, incomplete, conflicting, or clinically unusual for this patient and specialty, and the doctor must check it -- e.g. \"Dose not stated\", \"Verify with age\", \"Check pregnancy safety\", \"Conflicting frequency\". NOT a sentence or explanation. Empty string when clear. Never guess a value in order to avoid setting this."
    ),
});

export const INVESTIGATION_TYPES = ["lab", "imaging", "procedure"] as const;
export type InvestigationType = (typeof INVESTIGATION_TYPES)[number];

export const InvestigationSchema = z.object({
  name: z.string().describe('The test or procedure as ordered, e.g. "CBC", "HbA1c", "Lipid profile", "X-ray left knee", "ECHO".'),
  heard_as: z
    .string()
    .describe(
      'What the doctor\'s speech literally sounded like BEFORE correction -- ONLY when you corrected a real speech-recognition error in the test/procedure name. Empty string when the name was already clear.'
    ),
  // Deliberately z.string(), NOT z.enum. The Anthropic SDK's zodOutputFormat runs its
  // own transformJSONSchema, which DROPS the enum constraint and appends the values to
  // the description as a text hint instead. So generation is not actually constrained
  // to the three values — but z.enum would still be enforced when parsing the reply,
  // meaning one stray value ("blood test") would fail validation and throw away the
  // doctor's entire dictation. A permissive wire type plus normalizeInvestigationType()
  // degrades to "mis-categorised" instead of "lost", which is the right trade here.
  type: z
    .string()
    .describe(
      'Exactly one of: "lab" for blood/urine/serology work, "imaging" for X-ray/USG/ECHO/MRI/CT/ECG, "procedure" for something done to the patient such as a dressing change or suture removal.'
    ),
  instructions: z.string().describe('e.g. "fasting", "with reports at follow-up". Empty string if none given.'),
  review_flag: z
    .string()
    .describe(
      'A CRISP 2-4 word label ONLY if what was ordered is ambiguous or needs the doctor\'s confirmation -- e.g. "Which side?", "Confirm test panel". NOT a sentence. Empty string when clear.'
    ),
});

// Maps whatever the model returned onto one of the three known types. Falls back to
// "lab" only when there is no signal at all — mis-filing a test is recoverable in the
// editor, losing the prescription is not.
export function normalizeInvestigationType(raw: string): InvestigationType {
  const v = (raw || "").trim().toLowerCase();
  if ((INVESTIGATION_TYPES as readonly string[]).includes(v)) return v as InvestigationType;
  if (/x-?ray|usg|ultraso|echo|mri|\bct\b|scan|ecg|ekg|doppler|mammo|imag/.test(v)) return "imaging";
  if (/procedur|dressing|suture|biopsy|injection|removal/.test(v)) return "procedure";
  return "lab";
}

export const ReferralSchema = z.object({
  specialist: z.string().describe('Who the patient is being referred to, e.g. "Cardiologist", "Dr. Menon (Neurology)". Empty string if not stated.'),
  reason: z.string().describe("Why they are being referred, if stated. Empty string otherwise."),
});

// Non-drug interventions. For a physiotherapist or psychologist this IS the
// prescription — they don't prescribe medicine in the Indian system — and for a
// dentist it carries the aftercare ("soft diet", "ice pack") that must not be filed
// as a medication.
export const CarePlanSchema = z.object({
  activity: z
    .string()
    .describe('What the patient should do or receive, e.g. "Lumbar stabilization exercises", "CBT session", "Ultrasound therapy", "Ice pack to the jaw".'),
  frequency: z.string().describe('e.g. "Twice daily", "3 sets of 10", "Weekly". Empty string if not stated.'),
  duration: z.string().describe('e.g. "2 weeks", "6 sessions". Empty string if not stated.'),
  instructions: z.string().describe("Anything specific about how to do it, else empty string."),
});

export const PrescriptionSchema = z.object({
  patient: z.object({
    name: z.string().describe("Patient name. Empty string if not stated."),
    age: z.string().describe('e.g. "34 years", "8 months". Empty string if not stated.'),
    sex: z.string().describe('"Male", "Female", "Other", or empty string if not stated.'),
  }),
  date: z.string().describe("Visit date as YYYY-MM-DD. Use the date supplied in the input."),
  diagnosis: z.string().describe("Diagnosis if the doctor stated one, else empty string."),
  complaints: z.string().describe("Presenting complaints / symptoms if stated, else empty string."),
  medications: z
    .array(MedicationSchema)
    .describe("One entry per drug. Empty array if the visit ordered no medication — do not invent one to fill the list."),
  investigations: z
    .array(InvestigationSchema)
    .describe("Labs, imaging, and procedures ordered. Empty array if none."),
  // The one field that keeps real nullability — see the file-level comment on why.
  referral: ReferralSchema.nullable().describe("Null unless the doctor referred the patient to someone."),
  care_plan: z
    .array(CarePlanSchema)
    .describe(
      "Non-drug interventions: therapy sessions, exercises, physical modalities, dental aftercare. For non-prescribing specialties (Psychologist, Physiotherapist) this is the main output. Empty array if none."
    ),
  advice: z.string().describe("General non-drug advice: rest, fluids, diet, etc. Else empty string."),
  follow_up: z.string().describe('e.g. "Review in 3 days with reports", else empty string.'),
  noisy_environment_detected: z
    .boolean()
    .describe(
      "true when a meaningful amount of non-clinical crosstalk, background conversation or phone noise was identified and discarded. Lets the doctor know the recording environment may be worth changing."
    ),
  unclear_segments: z
    .array(z.string())
    .describe(
      "Any part of the dictation you could not confidently interpret, quoted as closely as possible, so the doctor can check it against what they said. Include a note here when the transcript appears to have a gap — a sentence that stops mid-thought, or an abrupt jump — since that may be speech the transcriber dropped. Empty array if the whole dictation was clear."
    ),
});

export type Medication = z.infer<typeof MedicationSchema>;
export type Investigation = z.infer<typeof InvestigationSchema>;
export type Referral = z.infer<typeof ReferralSchema>;
export type CarePlanItem = z.infer<typeof CarePlanSchema>;
export type StructuredRx = z.infer<typeof PrescriptionSchema>;

// Drives the Account dropdown and is passed to the model, which adjusts its reading
// of drug names and expected investigations accordingly (see Section C of the prompt).
export const SPECIALTIES = [
  "General Physician",
  "Cardiologist",
  "Pediatrician",
  "Dermatologist",
  "Gynecologist / Obstetrician",
  "Orthopedician",
  "Diabetologist / Endocrinologist",
  "Dentist",
  "Neurologist",
  "Psychiatrist",
  "Psychologist",
  "Physiotherapist",
  "Other",
] as const;

// These specialties don't prescribe medicine in the Indian system — a psychiatrist
// does, a psychologist doesn't. An empty medications array from either is the correct
// output, not a failed extraction, and the UI should say so rather than reading as
// broken. See Section C of the prompt.
export const NON_PRESCRIBING_SPECIALTIES = new Set<string>(["Psychologist", "Physiotherapist"]);

// The doctor's profile. No backend on this build — this shape is what lib/localStore.ts
// persists (minus id, which is never actually read by any consumer).
export type DoctorProfile = {
  id: string;
  full_name: string | null;
  qualifications: string | null;
  registration_number: string | null;
  clinic_name: string | null;
  clinic_address: string | null;
  signature_url: string | null;
  specialty: string | null;
};

// A saved visit record. Note there is deliberately no raw_transcript and no pdf_url —
// see docs on what RxVoice does and does not store.
export type PrescriptionRow = {
  id: string;
  doctor_id: string;
  patient_name: string | null;
  structured_rx: StructuredRx;
  created_at: string;
};

// A profile is only good enough to print from once it can produce a legally complete
// Indian prescription header.
export function isProfileComplete(d: DoctorProfile | null): boolean {
  if (!d) return false;
  return Boolean(d.full_name?.trim() && d.registration_number?.trim() && d.clinic_name?.trim());
}

export function emptyMedication(): Medication {
  return {
    name: "",
    heard_as: "",
    strength: "",
    form: "Tablet",
    frequency: "",
    timing: "",
    duration: "",
    instructions: "",
    carried_forward: false,
    review_flag: "",
  };
}

export function emptyInvestigation(): Investigation {
  return { name: "", heard_as: "", type: "lab", instructions: "", review_flag: "" };
}

export function emptyCarePlanItem(): CarePlanItem {
  return { activity: "", frequency: "", duration: "", instructions: "" };
}

// Total items the doctor still has to resolve — drives the summary banner.
// care_plan carries no review_flag (it's a plan of action, not a clinical judgment to
// double-check), so it never contributes here.
export function pendingFlagCount(rx: StructuredRx): number {
  return (
    rx.medications.filter((m) => m.review_flag).length +
    rx.investigations.filter((i) => i.review_flag).length +
    rx.unclear_segments.length
  );
}
