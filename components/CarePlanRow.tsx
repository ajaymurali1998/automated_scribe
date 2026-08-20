"use client";

import type { CarePlanItem } from "@/types/prescription";

type Props = {
  index: number;
  item: CarePlanItem;
  onChange: (index: number, patch: Partial<CarePlanItem>) => void;
  onRemove: (index: number) => void;
};

// No review-flag treatment here, unlike MedicationRow/InvestigationRow — a care plan
// item is a plan of action rather than a clinical judgment the model is unsure of, so
// the schema gives it no review_flag field to render.
export default function CarePlanRow({ index, item, onChange, onRemove }: Props) {
  return (
    <div className="rounded-xl border border-line bg-panel-2/40 p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <span className="section-label">Item {index + 1}</span>
        <button
          onClick={() => onRemove(index)}
          className="text-xs text-ink-soft hover:text-danger shrink-0"
          aria-label={`Remove care plan item ${index + 1}`}
        >
          Remove
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="label">Activity</label>
          <input
            className="input"
            value={item.activity}
            onChange={(e) => onChange(index, { activity: e.target.value })}
            placeholder="e.g. Lumbar stabilization exercises, CBT session"
          />
        </div>

        <div>
          <label className="label">Frequency</label>
          <input
            className="input"
            value={item.frequency ?? ""}
            onChange={(e) => onChange(index, { frequency: e.target.value })}
            placeholder="e.g. Twice daily, Weekly"
          />
        </div>

        <div>
          <label className="label">Duration</label>
          <input
            className="input"
            value={item.duration ?? ""}
            onChange={(e) => onChange(index, { duration: e.target.value })}
            placeholder="e.g. 2 weeks, 6 sessions"
          />
        </div>

        <div className="col-span-2">
          <label className="label">Instructions</label>
          <input
            className="input"
            value={item.instructions ?? ""}
            onChange={(e) => onChange(index, { instructions: e.target.value })}
            placeholder="Anything specific about how to do it"
          />
        </div>
      </div>
    </div>
  );
}
