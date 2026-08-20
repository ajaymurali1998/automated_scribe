"use client";

import Link from "next/link";

type HistoryItem = { id: string; patient_name: string | null; created_at: string };

type Props = {
  prescriptions: HistoryItem[];
  activeId: string | null;
  onNewScribe: () => void;
  onOpenPrescription: (id: string) => void;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

// No login on this build — history is a local list (lib/localStore.ts), so opening a
// past prescription is a state change in Workspace rather than a route.
export default function Sidebar({ prescriptions, activeId, onNewScribe, onOpenPrescription }: Props) {
  return (
    <aside className="flex flex-col border-r border-line bg-panel h-screen sticky top-0">
      <div className="p-5">
        <div className="flex items-center gap-2.5 mb-5">
          <span className="w-[22px] h-[22px] rounded-md bg-accent shadow-[0_0_20px_-2px_rgba(79,91,255,0.6)]" />
          <span className="font-head text-lg">RxVoice</span>
        </div>

        <button onClick={onNewScribe} className="btn btn-primary w-full">
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
                onClick={() => onOpenPrescription(p.id)}
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
        <Link href="/account" className="block text-sm text-ink-soft hover:text-ink">
          Account
        </Link>
      </div>
    </aside>
  );
}
