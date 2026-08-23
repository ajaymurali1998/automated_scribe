"use client";

import CorrectionDiff from "@/components/CorrectionDiff";
import type { Medication } from "@/types/prescription";

type Props = {
  index: number;
  med: Medication;
  onChange: (index: number, patch: Partial<Medication>) => void;
  onRemove: (index: number) => void;
};

const FORMS = ["Tablet", "Capsule", "Syrup", "Injection", "Drops", "Cream", "Ointment", "Inhaler", "Sachet", "Other"];

export default function MedicationRow({ index, med, onChange, onRemove }: Props) {
  const flagged = Boolean(med.review_flag);

  return (
    <div
      className={`rounded-xl border p-4 ${
        flagged ? "border-warn/40 bg-warn/[0.04]" : "border-line bg-panel-2/40"
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="section-label">Drug {index + 1}</span>
          {/* Makes the provenance of this row unmistakable: the doctor never dictated
              it this visit, it was pulled from the previous prescription. */}
          {med.carried_forward && <span className="badge badge-moss">From previous visit</span>}
          {/* A crisp 2-4 word pill, not a paragraph — the model is instructed to keep
              review_flag short at the source, so there's no truncation logic here.
              Clicking it dismisses, same as before, just far less visually heavy. */}
          {flagged && (
            <button
              onClick={() => onChange(index, { review_flag: "" })}
              className="badge badge-warn"
              title="Click to mark as checked"
            >
              {med.review_flag}
              <span aria-hidden>×</span>
            </button>
          )}
        </div>
        <button
          onClick={() => onRemove(index)}
          className="text-xs text-ink-soft hover:text-danger shrink-0"
          aria-label={`Remove drug ${index + 1}`}
        >
          Remove
        </button>
      </div>

      <CorrectionDiff heardAs={med.heard_as} correctedTo={med.name} />

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 sm:col-span-1">
          <label className="label">Drug name</label>
          <input
            className="input"
            value={med.name}
            onChange={(e) => onChange(index, { name: e.target.value })}
            placeholder="e.g. Dolo 650"
          />
        </div>

        <div>
          <label className="label">Strength</label>
          <input
            className="input"
            value={med.strength ?? ""}
            onChange={(e) => onChange(index, { strength: e.target.value })}
            placeholder="e.g. 650mg"
          />
        </div>

        <div>
          <label className="label">Form</label>
          <select
            className="input"
            value={med.form ?? ""}
            onChange={(e) => onChange(index, { form: e.target.value })}
          >
            <option value="">Not specified</option>
            {/* Keep whatever Claude produced even if it's off-list, so a valid but
                unusual form is never silently rewritten. */}
            {med.form && !FORMS.includes(med.form) && <option value={med.form}>{med.form}</option>}
            {FORMS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Frequency</label>
          <input
            className="input"
            value={med.frequency ?? ""}
            onChange={(e) => onChange(index, { frequency: e.target.value })}
            placeholder="e.g. Twice daily (BD)"
          />
        </div>

        <div>
          <label className="label">Timing</label>
          <select
            className="input"
            value={med.timing ?? ""}
            onChange={(e) => onChange(index, { timing: e.target.value })}
          >
            <option value="">Not specified</option>
            <option value="Before food">Before food</option>
            <option value="After food">After food</option>
            <option value="With food">With food</option>
            <option value="Empty stomach">Empty stomach</option>
          </select>
        </div>

        <div>
          <label className="label">Duration</label>
          <input
            className="input"
            value={med.duration ?? ""}
            onChange={(e) => onChange(index, { duration: e.target.value })}
            placeholder="e.g. 5 days"
          />
        </div>

        <div className="col-span-2">
          <label className="label">Instructions</label>
          <input
            className="input"
            value={med.instructions ?? ""}
            onChange={(e) => onChange(index, { instructions: e.target.value })}
            placeholder="Anything specific to this drug"
          />
        </div>
      </div>
    </div>
  );
}
