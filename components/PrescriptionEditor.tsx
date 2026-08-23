"use client";

import { useState } from "react";

import MedicationRow from "@/components/MedicationRow";
import InvestigationRow from "@/components/InvestigationRow";
import CarePlanRow from "@/components/CarePlanRow";
import DownloadPdfButton from "@/components/DownloadPdfButton";
import {
  NON_PRESCRIBING_SPECIALTIES,
  emptyCarePlanItem,
  emptyInvestigation,
  emptyMedication,
  type CarePlanItem,
  type DoctorProfile,
  type Investigation,
  type Medication,
  type StructuredRx,
} from "@/types/prescription";

type Props = {
  rx: StructuredRx;
  onChange: (rx: StructuredRx) => void;
  doctor: DoctorProfile | null;
  /** Absent in read-only history view. */
  onRegenerate?: () => void;
  onSave?: () => void;
  regenerating?: boolean;
  saving?: boolean;
  saved?: boolean;
  error?: string | null;
  /** True once the doctor has hand-edited, so Regenerate can warn before discarding. */
  dirty?: boolean;
};

export default function PrescriptionEditor({
  rx,
  onChange,
  doctor,
  onRegenerate,
  onSave,
  regenerating,
  saving,
  saved,
  error,
  dirty,
}: Props) {
  const [confirmRegen, setConfirmRegen] = useState(false);

  function patch(next: Partial<StructuredRx>) {
    onChange({ ...rx, ...next });
  }

  function patchMed(index: number, med: Partial<Medication>) {
    onChange({ ...rx, medications: rx.medications.map((m, i) => (i === index ? { ...m, ...med } : m)) });
  }

  function patchInv(index: number, inv: Partial<Investigation>) {
    onChange({ ...rx, investigations: rx.investigations.map((v, i) => (i === index ? { ...v, ...inv } : v)) });
  }

  function patchCare(index: number, item: Partial<CarePlanItem>) {
    onChange({ ...rx, care_plan: rx.care_plan.map((v, i) => (i === index ? { ...v, ...item } : v)) });
  }

  function handleRegenerate() {
    if (dirty && !confirmRegen) {
      setConfirmRegen(true);
      return;
    }
    setConfirmRegen(false);
    onRegenerate?.();
  }

  // Referral is null until the doctor adds one, so the section stays out of the way
  // for the majority of visits that don't involve a referral.
  const referral = rx.referral;

  return (
    <div className="max-w-[760px] pb-16">
      <h1 className="font-head text-3xl mb-1.5">Review visit record</h1>

      {/* The disclaimer is pinned above the form, not buried in a footer. The whole
          safety model of this app is that a human checks every field. */}
      <div className="rounded-xl border border-line bg-panel-2/50 px-4 py-3 my-5">
        <p className="text-[13px] text-ink-soft leading-relaxed">
          <strong className="text-ink font-semibold">Review every field before saving.</strong> This was drafted from
          your dictation by an automated tool and may contain errors. You are responsible for the accuracy of the
          prescription you issue.
        </p>
      </div>

      {/* Informational, not actionable — there's nothing to
          fix on THIS record. It's a note for next time (move somewhere quieter,
          stand closer to the mic), so it gets a quieter treatment than a review flag. */}
      {rx.noisy_environment_detected && (
        <div className="rounded-xl border border-line bg-panel-2/50 px-4 py-3 mb-5">
          <p className="text-ink-soft text-sm leading-relaxed">
            Background noise or crosstalk was detected and left out of this record. If something clinical seems
            missing, check it against the audio — and consider recording closer to the mic next time.
          </p>
        </div>
      )}


      {/* --- Patient --- */}
      <section className="panel p-6 mb-4">
        <p className="section-label mb-4">Patient</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="col-span-2">
            <label className="label">Name</label>
            <input
              className="input"
              value={rx.patient.name ?? ""}
              onChange={(e) => patch({ patient: { ...rx.patient, name: e.target.value } })}
            />
          </div>
          <div>
            <label className="label">Age</label>
            <input
              className="input"
              value={rx.patient.age ?? ""}
              onChange={(e) => patch({ patient: { ...rx.patient, age: e.target.value } })}
              placeholder="e.g. 52 years"
            />
          </div>
          <div>
            <label className="label">Sex</label>
            <select
              className="input"
              value={rx.patient.sex ?? ""}
              onChange={(e) => patch({ patient: { ...rx.patient, sex: e.target.value } })}
            >
              <option value="">—</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="label">Date</label>
            <input className="input" type="date" value={rx.date} onChange={(e) => patch({ date: e.target.value })} />
          </div>
        </div>
      </section>

      {/* --- Clinical --- */}
      <section className="panel p-6 mb-4">
        <p className="section-label mb-4">Clinical</p>
        <div className="mb-3">
          <label className="label">Complaints</label>
          <textarea
            className="input min-h-[64px] resize-y"
            value={rx.complaints ?? ""}
            onChange={(e) => patch({ complaints: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Diagnosis</label>
          <textarea
            className="input min-h-[64px] resize-y"
            value={rx.diagnosis ?? ""}
            onChange={(e) => patch({ diagnosis: e.target.value })}
          />
        </div>
      </section>

      {/* --- Medications --- */}
      <section className="panel p-6 mb-4">
        <div className="flex items-center justify-between mb-4">
          <p className="section-label">Medications</p>
          <span className="text-xs text-ink-soft">{rx.medications.length}</span>
        </div>

        {rx.medications.length === 0 && (
          <p className="text-ink-soft text-sm mb-4">
            {doctor?.specialty && NON_PRESCRIBING_SPECIALTIES.has(doctor.specialty)
              ? `No medications — expected for a ${doctor.specialty} visit. Add one below if this visit is an exception.`
              : "No medications in this visit. Add one below if that's not right."}
          </p>
        )}

        <div className="flex flex-col gap-3">
          {rx.medications.map((med, i) => (
            <MedicationRow key={i} index={i} med={med} onChange={patchMed} onRemove={(idx) =>
              onChange({ ...rx, medications: rx.medications.filter((_, j) => j !== idx) })
            } />
          ))}
        </div>

        <button
          onClick={() => onChange({ ...rx, medications: [...rx.medications, emptyMedication()] })}
          className="btn btn-ghost btn-sm mt-4"
        >
          + Add medication
        </button>
      </section>

      {/* --- Investigations --- */}
      <section className="panel p-6 mb-4">
        <div className="flex items-center justify-between mb-4">
          <p className="section-label">Investigations &amp; procedures</p>
          <span className="text-xs text-ink-soft">{rx.investigations.length}</span>
        </div>

        {rx.investigations.length === 0 && (
          <p className="text-ink-soft text-sm mb-4">No tests or procedures ordered.</p>
        )}

        <div className="flex flex-col gap-3">
          {rx.investigations.map((inv, i) => (
            <InvestigationRow key={i} index={i} investigation={inv} onChange={patchInv} onRemove={(idx) =>
              onChange({ ...rx, investigations: rx.investigations.filter((_, j) => j !== idx) })
            } />
          ))}
        </div>

        <button
          onClick={() => onChange({ ...rx, investigations: [...rx.investigations, emptyInvestigation()] })}
          className="btn btn-ghost btn-sm mt-4"
        >
          + Add test or procedure
        </button>
      </section>

      {/* --- Care plan ---
          For Psychologist/Physiotherapist visits this section carries the entire
          treatment plan while medications stays empty — see the empty-state copy
          above. Ordered after investigations per plan: drugs -> tests -> plan of
          action -> general advice -> follow-up. */}
      <section className="panel p-6 mb-4">
        <div className="flex items-center justify-between mb-4">
          <p className="section-label">Care plan</p>
          <span className="text-xs text-ink-soft">{rx.care_plan.length}</span>
        </div>

        {rx.care_plan.length === 0 && (
          <p className="text-ink-soft text-sm mb-4">No exercises, therapy sessions or other non-drug plan.</p>
        )}

        <div className="flex flex-col gap-3">
          {rx.care_plan.map((item, i) => (
            <CarePlanRow key={i} index={i} item={item} onChange={patchCare} onRemove={(idx) =>
              onChange({ ...rx, care_plan: rx.care_plan.filter((_, j) => j !== idx) })
            } />
          ))}
        </div>

        <button
          onClick={() => onChange({ ...rx, care_plan: [...rx.care_plan, emptyCarePlanItem()] })}
          className="btn btn-ghost btn-sm mt-4"
        >
          + Add care plan item
        </button>
      </section>

      {/* --- Referral --- */}
      <section className="panel p-6 mb-4">
        <div className="flex items-center justify-between mb-4">
          <p className="section-label">Referral</p>
          {referral ? (
            <button onClick={() => patch({ referral: null })} className="text-xs text-ink-soft hover:text-danger">
              Remove
            </button>
          ) : null}
        </div>

        {referral ? (
          <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
            <div>
              <label className="label">Refer to</label>
              <input
                className="input"
                value={referral.specialist ?? ""}
                onChange={(e) => patch({ referral: { ...referral, specialist: e.target.value } })}
                placeholder="e.g. Cardiologist"
              />
            </div>
            <div>
              <label className="label">Reason</label>
              <input
                className="input"
                value={referral.reason ?? ""}
                onChange={(e) => patch({ referral: { ...referral, reason: e.target.value } })}
                placeholder="Why they're being referred"
              />
            </div>
          </div>
        ) : (
          <button
            onClick={() => patch({ referral: { specialist: "", reason: "" } })}
            className="btn btn-ghost btn-sm"
          >
            + Add referral
          </button>
        )}
      </section>

      {/* --- Advice --- */}
      <section className="panel p-6 mb-5">
        <p className="section-label mb-4">Advice &amp; follow-up</p>
        <div className="mb-3">
          <label className="label">General advice</label>
          <textarea
            className="input min-h-[64px] resize-y"
            value={rx.advice ?? ""}
            onChange={(e) => patch({ advice: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Follow-up</label>
          <input
            className="input"
            value={rx.follow_up ?? ""}
            onChange={(e) => patch({ follow_up: e.target.value })}
          />
        </div>
      </section>

      {error && <p className="error-note mb-4">{error}</p>}

      {confirmRegen && (
        <div className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 mb-4">
          <p className="text-warn text-sm mb-2.5">
            You&apos;ve edited this record. Regenerating will replace your edits with a fresh draft from the original
            dictation.
          </p>
          <div className="flex gap-2">
            <button onClick={handleRegenerate} className="btn btn-sm btn-danger">
              Discard edits &amp; regenerate
            </button>
            <button onClick={() => setConfirmRegen(false)} className="btn btn-sm btn-ghost">
              Keep my edits
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-start gap-3">
        {onRegenerate && (
          <button onClick={handleRegenerate} className="btn btn-ghost" disabled={regenerating || saving}>
            {regenerating && <span className="spinner" />}
            {regenerating ? "Regenerating…" : "Regenerate"}
          </button>
        )}

        {onSave && (
          <button onClick={onSave} className="btn btn-ghost" disabled={saving || regenerating || saved}>
            {saving && <span className="spinner" />}
            {saved ? "Saved ✓" : saving ? "Saving…" : "Save to history"}
          </button>
        )}

        <DownloadPdfButton rx={rx} doctor={doctor} className="min-w-[200px]" onBeforeDownload={onSave} />
      </div>
    </div>
  );
}
