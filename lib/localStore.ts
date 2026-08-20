"use client";

// All browser persistence for the no-backend build. Nothing else in the app should
// touch localStorage directly — if storage moves to a real backend later, this is the
// only file that changes.
//
// Tradeoff, accepted for tonight: patient data (names, prescriptions) sits
// unencrypted in the dentist's browser instead of a database. Fine for one trusted
// user on his own machine; revisit before this goes to more than one person.
import type { DoctorProfile, PrescriptionRow, StructuredRx } from "@/types/prescription";

const PROFILE_KEY = "rxvoice:profile";
const PRESCRIPTIONS_KEY = "rxvoice:prescriptions";
const MAX_PRESCRIPTIONS = 50;

// Every read is wrapped — private browsing, storage quota, or a disabled API must
// degrade to "empty", never throw and break the page.
function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // Quota exceeded or storage disabled — caller decides how to surface this.
    return false;
  }
}

// ---------------------------------------------------------------------------
// Profile — the letterhead every PDF prints from, plus the specialty sent to Claude.
// ---------------------------------------------------------------------------

export type LocalProfile = Omit<DoctorProfile, "id">;

const EMPTY_PROFILE: LocalProfile = {
  full_name: null,
  qualifications: null,
  registration_number: null,
  clinic_name: null,
  clinic_address: null,
  signature_url: null,
  specialty: null,
};

export function loadProfile(): LocalProfile {
  return readJSON(PROFILE_KEY, EMPTY_PROFILE);
}

export function saveProfile(profile: LocalProfile): boolean {
  return writeJSON(PROFILE_KEY, profile);
}

// Reads a File into a base64 data URL. Used for the signature upload — with no
// server there's nowhere else for it to live, and react-pdf's <Image> accepts a data
// URL directly, so no signed-URL step is needed at print time either.
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

// ---------------------------------------------------------------------------
// Prescriptions — capped local history, newest first.
// ---------------------------------------------------------------------------

export type StoredPrescription = Omit<PrescriptionRow, "doctor_id">;

function readAll(): StoredPrescription[] {
  return readJSON<StoredPrescription[]>(PRESCRIPTIONS_KEY, []);
}

export function listPrescriptions(): StoredPrescription[] {
  return readAll();
}

export function getPrescription(id: string): StoredPrescription | null {
  return readAll().find((p) => p.id === id) ?? null;
}

export function savePrescription(structured: StructuredRx): StoredPrescription {
  const entry: StoredPrescription = {
    id: crypto.randomUUID(),
    patient_name: structured.patient.name,
    structured_rx: structured,
    created_at: new Date().toISOString(),
  };

  const next = [entry, ...readAll()].slice(0, MAX_PRESCRIPTIONS);
  writeJSON(PRESCRIPTIONS_KEY, next);
  return entry;
}

// Updates a prescription that was reopened from history, in place — Workspace calls
// this instead of savePrescription() for an edit-and-resave so the doctor's history
// doesn't accumulate a duplicate every time they touch an old record.
export function updatePrescription(id: string, structured: StructuredRx): void {
  writeJSON(
    PRESCRIPTIONS_KEY,
    readAll().map((p) =>
      p.id === id ? { ...p, patient_name: structured.patient.name, structured_rx: structured } : p
    )
  );
}

export function deletePrescription(id: string): void {
  writeJSON(
    PRESCRIPTIONS_KEY,
    readAll().filter((p) => p.id !== id)
  );
}
