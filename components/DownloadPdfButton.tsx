"use client";

// Generates and downloads the PDF in the browser.
//
// No backend on this build: the signature is already a base64 data URL from
// lib/localStore.ts, so it's handed to PrescriptionPDF as-is — no signed-URL step.
//
// @react-pdf/renderer is imported lazily — it is a large bundle and does not belong
// in the initial page load.
import { useState } from "react";

import { isProfileComplete, type DoctorProfile, type StructuredRx } from "@/types/prescription";

type Props = {
  rx: StructuredRx;
  doctor: DoctorProfile | null;
  className?: string;
  label?: string;
};

function fileName(rx: StructuredRx): string {
  const who = (rx.patient.name || "patient").trim().replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
  return `rx-${who}-${rx.date}.pdf`;
}

export default function DownloadPdfButton({ rx, doctor, className, label = "Download PDF" }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = isProfileComplete(doctor);

  async function download() {
    if (!doctor) return;
    setBusy(true);
    setError(null);

    try {
      const [{ pdf }, { default: PrescriptionPDF }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/components/PrescriptionPDF"),
      ]);

      const blob = await pdf(
        <PrescriptionPDF rx={rx} doctor={doctor} signatureUrl={doctor.signature_url} />
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName(rx);
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Give the browser a beat to start the download before revoking.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      console.error("[pdf] generation failed", e);
      setError("Could not generate the PDF. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    // Blocking is deliberate: a prescription without a name, clinic and registration
    // number isn't a valid Indian prescription, and printing a blank letterhead is
    // worse than refusing.
    return (
      <div className={className}>
        <button className="btn btn-ghost w-full" disabled title="Complete your profile first">
          {label}
        </button>
        <p className="text-xs text-warn mt-2 leading-relaxed">
          Add your name, clinic and registration number in{" "}
          <a href="/account" className="underline">
            Account
          </a>{" "}
          to print prescriptions.
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      <button onClick={download} className="btn btn-primary w-full" disabled={busy}>
        {busy && <span className="spinner" />}
        {busy ? "Preparing…" : label}
      </button>
      {error && <p className="error-note mt-2">{error}</p>}
    </div>
  );
}
