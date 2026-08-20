"use client";

import { EXAMPLE_SCRIPT } from "@/lib/prompts";
import { SPECIALTIES } from "@/types/prescription";

export type PreviousVisit = { id: string; patient_name: string | null; created_at: string };

type Props = {
  patientName: string;
  onPatientNameChange: (v: string) => void;
  template: string;
  onTemplateChange: (v: string) => void;
  /** Defaults from the saved Account profile but is overridable per recording — this
   *  dictation's choice does not overwrite the saved default. */
  specialty: string;
  onSpecialtyChange: (v: string) => void;
  /** Recent visits the doctor can attach as history for "continue the same". */
  previousVisits: PreviousVisit[];
  previousVisitId: string | null;
  onPreviousVisitChange: (id: string | null) => void;
  onStart: () => void;
  starting: boolean;
  error: string | null;
};

// v1 has one template. The dropdown exists because the shape of the app is
// "pick an output format, then dictate", and adding SOAP notes or a referral letter
// later shouldn't mean rearranging this screen.
const TEMPLATES = [{ value: "prescription", label: "Prescription" }];

export default function NewRecording({
  patientName,
  onPatientNameChange,
  template,
  onTemplateChange,
  specialty,
  onSpecialtyChange,
  previousVisits,
  previousVisitId,
  onPreviousVisitChange,
  onStart,
  starting,
  error,
}: Props) {
  return (
    <div className="max-w-[640px]">
      <h1 className="font-head text-3xl mb-1.5">New prescription</h1>
      <p className="text-ink-soft mb-7">Dictate naturally. You'll review and edit everything before it prints.</p>

      <div className="panel p-6 mb-5">
        <div className="mb-4">
          <label className="label" htmlFor="patient">
            Patient name <span className="font-normal text-ink-soft">(optional)</span>
          </label>
          <input
            id="patient"
            className="input"
            value={patientName}
            onChange={(e) => onPatientNameChange(e.target.value)}
            placeholder="e.g. Ramesh Kumar"
          />
        </div>

        <div className="mb-5">
          <label className="label" htmlFor="template">
            Template
          </label>
          <select
            id="template"
            className="input"
            value={template}
            onChange={(e) => onTemplateChange(e.target.value)}
          >
            {TEMPLATES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-5">
          <label className="label" htmlFor="specialty">
            Area of practice <span className="font-normal text-ink-soft">(optional)</span>
          </label>
          <select
            id="specialty"
            className="input"
            value={specialty}
            onChange={(e) => onSpecialtyChange(e.target.value)}
          >
            <option value="">Not specified</option>
            {SPECIALTIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <p className="text-xs text-ink-soft mt-1.5 leading-relaxed">
            Helps interpret your dictation — drug names and expected tests differ by specialty. Defaults to what&apos;s
            set in Account.
          </p>
        </div>

        {/* Attaching history is explicit and opt-in. Auto-matching on patient name
            would risk pulling a different Ramesh Kumar's medications into a live
            prescription, which is not a mistake worth saving two clicks for. */}
        {previousVisits.length > 0 && (
          <div className="mb-5">
            <label className="label" htmlFor="previous">
              Follow-up visit? <span className="font-normal text-ink-soft">(optional)</span>
            </label>
            <select
              id="previous"
              className="input"
              value={previousVisitId ?? ""}
              onChange={(e) => onPreviousVisitChange(e.target.value || null)}
            >
              <option value="">New visit — no previous prescription</option>
              {previousVisits.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.patient_name || "Unnamed patient"} —{" "}
                  {new Date(v.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                </option>
              ))}
            </select>
            <p className="text-xs text-ink-soft mt-1.5 leading-relaxed">
              Attach the last visit so &ldquo;continue the same&rdquo; can be resolved against it.
            </p>
          </div>
        )}

        {error && <p className="error-note mb-4">{error}</p>}

        <button onClick={onStart} className="btn btn-primary w-full" disabled={starting}>
          {starting ? <span className="spinner" /> : <MicIcon />}
          {starting ? "Starting…" : "Start recording"}
        </button>
      </div>

      <div className="panel p-6">
        <p className="section-label mb-3">Example dictation</p>
        <pre className="font-mono text-[13px] text-ink-soft leading-relaxed whitespace-pre-wrap">
          {EXAMPLE_SCRIPT}
        </pre>
        <p className="text-xs text-ink-soft mt-4 leading-relaxed">
          Shorthand works — say &ldquo;BD&rdquo;, &ldquo;TDS&rdquo;, &ldquo;HS&rdquo;, &ldquo;after food&rdquo; just as
          you would write them.
        </p>
      </div>
    </div>
  );
}

function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" />
    </svg>
  );
}
