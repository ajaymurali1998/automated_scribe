"use client";

// The two-panel shell and the state machine: new -> recording -> review, plus
// reopening a saved prescription from history.
//
// No backend on this build — profile and prescription history live in
// lib/localStore.ts. Opening a saved prescription is a state change here, not a
// route, since there's no server to fetch it from.
import { useEffect, useState } from "react";

import Sidebar from "@/components/Sidebar";
import NewRecording from "@/components/NewRecording";
import RecordingView from "@/components/RecordingView";
import PrescriptionEditor from "@/components/PrescriptionEditor";
import { useDictation } from "@/lib/useDictation";
import { formatPreviousRx } from "@/lib/prompts";
import {
  deletePrescription,
  listPrescriptions,
  loadProfile,
  savePrescription,
  updatePrescription,
  type LocalProfile,
  type StoredPrescription,
} from "@/lib/localStore";
import type { DoctorProfile, StructuredRx } from "@/types/prescription";

type Stage = "new" | "recording" | "review";

function toDoctorProfile(p: LocalProfile): DoctorProfile {
  // id is never read by any consumer (PrescriptionEditor/PrescriptionPDF/
  // DownloadPdfButton only use the profile fields) — it exists purely because
  // DoctorProfile was designed around a database row that no longer exists here.
  return { id: "local", ...p };
}

export default function Workspace() {
  const dictation = useDictation();

  const [stage, setStage] = useState<Stage>("new");
  const [patientName, setPatientName] = useState("");
  const [template, setTemplate] = useState("prescription");

  const [previousVisitId, setPreviousVisitId] = useState<string | null>(null);

  // Defaults from the saved Account profile once it loads, but is overridable per
  // recording — this dictation's choice does not overwrite the saved default.
  const [specialty, setSpecialty] = useState("");

  // Held in memory only — the raw dictation is never persisted, so Regenerate works
  // for as long as the doctor is on this screen and no longer. Empty when a saved
  // prescription was reopened from history, which hides the Regenerate button.
  const [transcript, setTranscript] = useState("");
  const [rx, setRx] = useState<StructuredRx | null>(null);
  const [dirty, setDirty] = useState(false);

  // Set when reviewing a prescription reopened from history — Save then updates this
  // entry in place instead of creating a new one.
  const [openedId, setOpenedId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [structuring, setStructuring] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const [profile, setProfile] = useState<LocalProfile | null>(null);
  const [history, setHistory] = useState<StoredPrescription[]>([]);

  // Loaded in an effect, not useState(loadProfile()), so this renders identically on
  // the server and on first client paint — reading localStorage during render would
  // desync SSR output from the client.
  useEffect(() => {
    const p = loadProfile();
    setProfile(p);
    setSpecialty(p.specialty ?? "");
    setHistory(listPrescriptions());
  }, []);

  function refreshHistory() {
    setHistory(listPrescriptions());
  }

  // Guard against losing an unsaved prescription to a stray navigation.
  useEffect(() => {
    const risky = stage === "recording" || (stage === "review" && !savedId);
    if (!risky) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [stage, savedId]);

  async function structure(text: string) {
    setStructuring(true);
    setReviewError(null);
    try {
      const previousEntry = previousVisitId ? history.find((h) => h.id === previousVisitId) : null;

      const res = await fetch("/api/structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: text,
          patientName,
          specialty: specialty || null,
          previousRx: previousEntry ? formatPreviousRx(previousEntry.structured_rx) : null,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { structured?: StructuredRx; error?: string };
      if (!res.ok || !body.structured) {
        throw new Error(body.error || "Could not structure the dictation.");
      }
      setRx(body.structured);
      setDirty(false);
      setSavedId(null);
      setOpenedId(null);
      setStage("review");
    } catch (e) {
      setReviewError((e as Error).message);
      // Stay on review if we already have something to show, else fall back so the
      // transcript isn't stranded on a dead screen.
      setStage((s) => (rx ? s : "review"));
    } finally {
      setStructuring(false);
    }
  }

  async function startRecording() {
    setStage("recording");
    await dictation.start();
  }

  async function endRecording() {
    const text = await dictation.stop();
    setTranscript(text);
    if (!text.trim()) {
      setRx(null);
      setReviewError("No speech was captured. Please try recording again.");
      setStage("review");
      return;
    }
    await structure(text);
  }

  function newScribe() {
    dictation.reset();
    setStage("new");
    setPatientName("");
    setSpecialty(profile?.specialty ?? "");
    setPreviousVisitId(null);
    setTranscript("");
    setRx(null);
    setDirty(false);
    setSavedId(null);
    setOpenedId(null);
    setConfirmDelete(false);
    setReviewError(null);
  }

  function openPrescription(id: string) {
    const entry = history.find((h) => h.id === id);
    if (!entry) return;
    dictation.reset();
    setStage("review");
    setTranscript(""); // no transcript for a reopened record — hides Regenerate
    setRx(entry.structured_rx);
    setDirty(false);
    setOpenedId(id);
    setSavedId(id);
    setConfirmDelete(false);
    setReviewError(null);
  }

  function save() {
    if (!rx) return;
    setSaving(true);
    setReviewError(null);
    try {
      if (openedId) {
        updatePrescription(openedId, rx);
        setSavedId(openedId);
      } else {
        const entry = savePrescription(rx);
        setSavedId(entry.id);
        setOpenedId(entry.id);
      }
      refreshHistory();
    } catch {
      setReviewError("Could not save — your browser's storage may be full or disabled (private browsing?).");
    } finally {
      setSaving(false);
    }
  }

  function remove() {
    if (!openedId) return;
    deletePrescription(openedId);
    refreshHistory();
    newScribe();
  }

  const doctor = profile ? toDoctorProfile(profile) : null;

  return (
    <div className="grid grid-cols-[minmax(0,280px)_minmax(0,1fr)] max-lg:grid-cols-1">
      <Sidebar
        prescriptions={history}
        activeId={savedId}
        onNewScribe={newScribe}
        onOpenPrescription={openPrescription}
      />

      <main className="px-8 py-10 max-sm:px-5">
        {stage === "new" && (
          <NewRecording
            patientName={patientName}
            onPatientNameChange={setPatientName}
            template={template}
            onTemplateChange={setTemplate}
            specialty={specialty}
            onSpecialtyChange={setSpecialty}
            previousVisits={history.slice(0, 20)}
            previousVisitId={previousVisitId}
            onPreviousVisitChange={setPreviousVisitId}
            onStart={startRecording}
            starting={dictation.status === "connecting"}
            error={dictation.error}
          />
        )}

        {stage === "recording" && (
          <RecordingView
            status={dictation.status}
            transcript={dictation.transcript}
            interim={dictation.interim}
            elapsed={dictation.elapsed}
            warning={dictation.warning ?? dictation.error}
            onPause={dictation.pause}
            onResume={dictation.resume}
            onEnd={endRecording}
            ending={structuring}
          />
        )}

        {stage === "review" && (
          <>
            {structuring && !rx && (
              <div className="flex items-center gap-3 text-ink-soft">
                <span className="spinner" />
                Structuring your dictation…
              </div>
            )}

            {!structuring && !rx && (
              <div className="max-w-[560px]">
                <h1 className="font-head text-3xl mb-4">Nothing to review</h1>
                {reviewError && <p className="error-note mb-5">{reviewError}</p>}
                <button onClick={newScribe} className="btn btn-primary">
                  Start again
                </button>
              </div>
            )}

            {rx && (
              <>
                <PrescriptionEditor
                  rx={rx}
                  onChange={(next) => {
                    setRx(next);
                    setDirty(true);
                    setSavedId(null);
                  }}
                  doctor={doctor}
                  onRegenerate={transcript ? () => void structure(transcript) : undefined}
                  onSave={save}
                  regenerating={structuring}
                  saving={saving}
                  saved={Boolean(savedId) && !dirty}
                  error={reviewError}
                  dirty={dirty}
                />

                {openedId && (
                  <div className="max-w-[760px] border-t border-line pt-5 mt-2">
                    {confirmDelete ? (
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="text-sm text-ink-soft">Delete this prescription permanently?</span>
                        <button onClick={remove} className="btn btn-sm btn-danger">
                          Delete
                        </button>
                        <button onClick={() => setConfirmDelete(false)} className="btn btn-sm btn-ghost">
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(true)}
                        className="text-sm text-ink-soft hover:text-danger"
                      >
                        Delete this prescription
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
