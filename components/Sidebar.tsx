"use client";

import Link from "next/link";

type HistoryItem = { id: string; patient_name: string | null; created_at: string };

type Props = {
  prescriptions: HistoryItem[];
  activeId: string | null;
  onNewScribe: () => void;
  onOpenPrescription: (id: string) => void;
  /** Amber dot on the Account link when the letterhead is incomplete. */
  profileComplete: boolean;
  /** Mobile-only drawer state — ignored above the lg breakpoint, where the sidebar is
   *  always visible as a static column (see the lg: overrides below). */
  open: boolean;
  onClose: () => void;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

// No login on this build — history is a local list (lib/localStore.ts), so opening a
// past prescription is a state change in Workspace rather than a route.
//
// Below lg (1024px — every phone) this is an off-canvas drawer: fixed, full height,
// translated off-screen until `open`. Above lg it reverts to the original static
// column via the lg: overrides, so desktop is unaffected by any of this.
export default function Sidebar({
  prescriptions,
  activeId,
  onNewScribe,
  onOpenPrescription,
  profileComplete,
  open,
  onClose,
}: Props) {
  return (
    <>
      {/* Backdrop — mobile only, closes the drawer on tap. Absent (and inert) on desktop. */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-[280px] flex flex-col border-r border-line bg-panel transition-transform duration-200 ease-out lg:static lg:z-auto lg:h-screen lg:w-auto lg:sticky lg:top-0 lg:translate-x-0 lg:transition-none ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="p-5">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <span className="w-[22px] h-[22px] rounded-md bg-accent shadow-[0_0_20px_-2px_rgba(79,91,255,0.6)]" />
              <span className="font-head text-lg">RxVoice</span>
            </div>
            {/* Mobile-only close button — desktop never shows a drawer, so never needs one. */}
            <button
              onClick={onClose}
              className="lg:hidden text-ink-soft hover:text-ink text-xl leading-none px-1"
              aria-label="Close menu"
            >
              ×
            </button>
          </div>

          <button
            onClick={() => {
              onNewScribe();
              onClose();
            }}
            className="btn btn-primary w-full"
          >
            + New Scribe
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 min-h-0">
          <p className="section-label mb-2.5">My Scribes</p>

          {prescriptions.length === 0 && (
            <p className="text-ink-soft text-sm py-2 leading-relaxed">
              Nothing yet. Your saved prescriptions will appear here.
            </p>
          )}

          <ul className="flex flex-col gap-1 pb-4">
            {prescriptions.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => {
                    onOpenPrescription(p.id);
                    onClose();
                  }}
                  className={`block w-full text-left rounded-lg px-3 py-2.5 border transition-colors ${
                    activeId === p.id
                      ? "bg-panel-2 border-line-strong"
                      : "border-transparent hover:bg-panel-2 hover:border-line"
                  }`}
                >
                  <span className="block text-sm truncate">{p.patient_name || "Unnamed patient"}</span>
                  <span className="block text-xs text-ink-soft mt-0.5">{formatDate(p.created_at)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="p-5 border-t border-line">
          <Link href="/account" className="flex items-center gap-2 text-sm text-ink-soft hover:text-ink" onClick={onClose}>
            Account
            {/* Persists until the letterhead is complete — the ambient signal that
                survives navigating away from the New Recording banner. */}
            {!profileComplete && (
              <span className="w-1.5 h-1.5 rounded-full bg-warn" title="Profile incomplete" aria-hidden />
            )}
          </Link>
        </div>
      </aside>
    </>
  );
}
