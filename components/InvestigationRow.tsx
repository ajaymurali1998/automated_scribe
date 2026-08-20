"use client";

import { INVESTIGATION_TYPES, type Investigation } from "@/types/prescription";

type Props = {
  index: number;
  investigation: Investigation;
  onChange: (index: number, patch: Partial<Investigation>) => void;
  onRemove: (index: number) => void;
};

// Mirrors the three-way split in the schema. "procedure" covers things done TO the
// patient (dressing change, suture removal) as opposed to something measured.
const LABELS: Record<string, string> = {
  lab: "Lab test",
  imaging: "Imaging",
  procedure: "Procedure",
};

export default function InvestigationRow({ index, investigation, onChange, onRemove }: Props) {
  const flagged = Boolean(investigation.review_flag);

  return (
    <div
      className={`rounded-xl border p-4 ${
        flagged ? "border-warn/40 bg-warn/[0.04]" : "border-line bg-panel-2/40"
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <span className="section-label">Item {index + 1}</span>
        <button
          onClick={() => onRemove(index)}
          className="text-xs text-ink-soft hover:text-danger shrink-0"
          aria-label={`Remove investigation ${index + 1}`}
        >
          Remove
        </button>
      </div>

      {flagged && (
        <div className="mb-3 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2.5">
          <p className="text-warn text-[13px] leading-relaxed">
            <strong className="font-semibold">Needs your check:</strong> {investigation.review_flag}
          </p>
          <button
            onClick={() => onChange(index, { review_flag: "" })}
            className="text-xs text-warn/80 hover:text-warn underline mt-1.5"
          >
            I&apos;ve checked this
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Test / procedure</label>
          <input
            className="input"
            value={investigation.name}
            onChange={(e) => onChange(index, { name: e.target.value })}
            placeholder="e.g. CBC, X-ray left knee"
          />
        </div>

        <div>
          <label className="label">Type</label>
          <select
            className="input"
            value={investigation.type}
            onChange={(e) => onChange(index, { type: e.target.value })}
          >
            {/* Preserve an unrecognised value rather than silently snapping it to
                "lab" — normalizeInvestigationType should have caught it, but if one
                slips through the doctor should see what it actually says. */}
            {!(INVESTIGATION_TYPES as readonly string[]).includes(investigation.type) && (
              <option value={investigation.type}>{investigation.type || "Not specified"}</option>
            )}
            {INVESTIGATION_TYPES.map((t) => (
              <option key={t} value={t}>
                {LABELS[t]}
              </option>
            ))}
          </select>
        </div>

        <div className="col-span-2">
          <label className="label">Instructions</label>
          <input
            className="input"
            value={investigation.instructions ?? ""}
            onChange={(e) => onChange(index, { instructions: e.target.value })}
            placeholder="e.g. fasting, bring reports to follow-up"
          />
        </div>
      </div>
    </div>
  );
}
