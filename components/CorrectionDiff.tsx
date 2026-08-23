"use client";

// A one-line "what you said → what we corrected it to" strip. Shown only when a
// speech-recognition correction actually happened (heard_as non-empty) — most rows
// never render this at all. Shared by MedicationRow and InvestigationRow so the two
// never drift into different visual treatments.
type Props = { heardAs: string; correctedTo: string };

export default function CorrectionDiff({ heardAs, correctedTo }: Props) {
  if (!heardAs) return null;

  return (
    <p className="text-xs mb-2 leading-relaxed">
      <span className="text-danger line-through decoration-danger/60">{heardAs}</span>
      <span className="text-ink-soft mx-1.5">→</span>
      <span className="text-moss font-medium">{correctedTo}</span>
    </p>
  );
}
