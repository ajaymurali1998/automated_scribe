"use client";

// The doctor's letterhead. Every field here lands on the printed prescription, so
// the three that make an Indian prescription legally complete — name, clinic and
// registration number — are marked required and gate PDF download until filled.
//
// No backend on this build: everything here lives in localStorage (lib/localStore.ts),
// including the signature, which is stored as a base64 data URL rather than uploaded
// anywhere.
import { useEffect, useState } from "react";
import Link from "next/link";

import { fileToDataUrl, loadProfile, saveProfile, type LocalProfile } from "@/lib/localStore";
import { SPECIALTIES, isProfileComplete } from "@/types/prescription";

const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024;

export default function AccountForm() {
  const [doctor, setDoctor] = useState<LocalProfile | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Loaded in an effect rather than useState(loadProfile) so this component renders
  // identically on the server and on first client paint — reading localStorage during
  // render would desync SSR output from the client and trip a hydration warning.
  useEffect(() => {
    setDoctor(loadProfile());
  }, []);

  function field(key: keyof LocalProfile, value: string) {
    setDoctor((d) => (d ? { ...d, [key]: value || null } : d));
    setSaved(false);
  }

  async function uploadSignature(file: File) {
    setError(null);

    if (!file.type.startsWith("image/")) {
      setError("The signature must be an image file.");
      return;
    }
    if (file.size > MAX_SIGNATURE_BYTES) {
      setError("That image is too large — please use one under 2 MB.");
      return;
    }

    setUploading(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      setDoctor((d) => {
        const next = d ? { ...d, signature_url: dataUrl } : d;
        if (next) saveProfile(next);
        return next;
      });
    } catch {
      setError("Could not read that file.");
    } finally {
      setUploading(false);
    }
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!doctor) return;
    if (!saveProfile(doctor)) {
      setError("Could not save — your browser's storage may be full or disabled (private browsing?).");
      return;
    }
    setError(null);
    setSaved(true);
  }

  return (
    <main className="max-w-[680px] mx-auto px-6 py-12">
      <Link href="/" className="text-sm text-ink-soft hover:text-ink">
        ← Back to scribe
      </Link>

      <h1 className="font-head text-3xl mt-5 mb-1.5">Account</h1>
      <p className="text-ink-soft mb-7">These details form the letterhead on every prescription you print.</p>

      {doctor && (
        <>
          {!isProfileComplete({ ...doctor, id: "" }) && (
            <div className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 mb-5">
              <p className="text-warn text-sm leading-relaxed">
                Add your full name, clinic name and registration number to enable PDF downloads.
              </p>
            </div>
          )}

          <form onSubmit={save} className="panel p-6 mb-5">
            <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
              <div>
                <label className="label">Full name *</label>
                <input
                  className="input"
                  value={doctor.full_name ?? ""}
                  onChange={(e) => field("full_name", e.target.value)}
                  placeholder="Dr. Priya Sharma"
                  required
                />
              </div>
              <div>
                <label className="label">Qualifications</label>
                <input
                  className="input"
                  value={doctor.qualifications ?? ""}
                  onChange={(e) => field("qualifications", e.target.value)}
                  placeholder="MBBS, MD (General Medicine)"
                />
              </div>
              <div>
                <label className="label">Registration number *</label>
                <input
                  className="input"
                  value={doctor.registration_number ?? ""}
                  onChange={(e) => field("registration_number", e.target.value)}
                  placeholder="e.g. KMC 12345"
                  required
                />
              </div>
              <div>
                <label className="label">Clinic name *</label>
                <input
                  className="input"
                  value={doctor.clinic_name ?? ""}
                  onChange={(e) => field("clinic_name", e.target.value)}
                  placeholder="Sunrise Clinic"
                  required
                />
              </div>
              <div>
                <label className="label">Specialty</label>
                <select
                  className="input"
                  value={doctor.specialty ?? ""}
                  onChange={(e) => field("specialty", e.target.value)}
                >
                  <option value="">Not specified</option>
                  {/* Preserve a value that isn't on the list rather than silently
                      resetting it — the field is free text by design. */}
                  {doctor.specialty && !SPECIALTIES.includes(doctor.specialty as (typeof SPECIALTIES)[number]) && (
                    <option value={doctor.specialty}>{doctor.specialty}</option>
                  )}
                  {SPECIALTIES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-ink-soft mt-1.5 leading-relaxed">
                  Helps interpret your dictation — drug names and expected tests differ by specialty.
                </p>
              </div>

              <div className="col-span-2 max-sm:col-span-1">
                <label className="label">Clinic address</label>
                <textarea
                  className="input min-h-[72px] resize-y"
                  value={doctor.clinic_address ?? ""}
                  onChange={(e) => field("clinic_address", e.target.value)}
                  placeholder="Street, area, city, PIN · phone"
                />
              </div>
            </div>

            {error && <p className="error-note mt-4">{error}</p>}

            <button type="submit" className="btn btn-primary mt-5">
              {saved ? "Saved ✓" : "Save profile"}
            </button>
          </form>

          <section className="panel p-6">
            <p className="section-label mb-3">Signature</p>
            <p className="text-sm text-ink-soft mb-4 leading-relaxed">
              A PNG with a transparent background works best. Stored only in this browser.
            </p>

            {doctor.signature_url && (
              <div className="mb-4 inline-block rounded-lg bg-white p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={doctor.signature_url} alt="Your signature" className="h-14 w-auto object-contain" />
              </div>
            )}

            <label className="btn btn-ghost btn-sm cursor-pointer inline-flex">
              {uploading && <span className="spinner" />}
              {uploading ? "Uploading…" : doctor.signature_url ? "Replace signature" : "Upload signature"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadSignature(file);
                  e.target.value = "";
                }}
              />
            </label>
          </section>
        </>
      )}
    </main>
  );
}
