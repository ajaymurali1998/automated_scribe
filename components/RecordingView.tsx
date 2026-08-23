"use client";

import { useEffect, useRef, useState } from "react";

import type { DictationStatus } from "@/lib/useDictation";

type Props = {
  status: DictationStatus;
  transcript: string;
  interim: string;
  elapsed: number;
  warning: string | null;
  onPause: () => void;
  onResume: () => void;
  onEnd: () => void;
  onStartOver: () => void;
  ending: boolean;
};

function mmss(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function RecordingView({
  status,
  transcript,
  interim,
  elapsed,
  warning,
  onPause,
  onResume,
  onEnd,
  onStartOver,
  ending,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [confirmStartOver, setConfirmStartOver] = useState(false);
  const paused = status === "paused";

  function handleStartOver() {
    if (!confirmStartOver) {
      setConfirmStartOver(true);
      return;
    }
    setConfirmStartOver(false);
    onStartOver();
  }

  // Keep the newest words in view as they arrive.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcript, interim]);

  return (
    <div className="max-w-[720px]">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2.5">
          <span
            className={`w-2.5 h-2.5 rounded-full ${paused ? "bg-ink-soft" : "bg-danger rec-dot"}`}
            aria-hidden
          />
          <span className="font-head text-2xl">{paused ? "Paused" : "Recording"}</span>
          <span className="font-mono text-lg text-ink-soft tabular-nums ml-1">{mmss(elapsed)}</span>
        </div>

        <div className="flex gap-2.5">
          {paused ? (
            <button onClick={onResume} className="btn btn-ghost btn-sm" disabled={ending}>
              Resume
            </button>
          ) : (
            <button onClick={onPause} className="btn btn-ghost btn-sm" disabled={ending}>
              Pause
            </button>
          )}
          <button onClick={handleStartOver} className="btn btn-ghost btn-sm" disabled={ending}>
            Start over
          </button>
          <button onClick={onEnd} className="btn btn-primary btn-sm" disabled={ending}>
            {ending && <span className="spinner" />}
            {ending ? "Processing…" : "End recording"}
          </button>
        </div>
      </div>

      {/* Confirm before discarding live audio — an accidental tap here is a much
          worse outcome than the one extra click. */}
      {confirmStartOver && (
        <div className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 mb-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-warn text-sm">Discard this recording and start fresh?</span>
          <div className="flex gap-2">
            <button onClick={handleStartOver} className="btn btn-sm btn-danger">
              Discard &amp; start over
            </button>
            <button onClick={() => setConfirmStartOver(false)} className="btn btn-sm btn-ghost">
              Cancel
            </button>
          </div>
        </div>
      )}

      {warning && (
        <p className="badge badge-warn mb-4 !block !rounded-lg !px-3 !py-2 leading-relaxed">{warning}</p>
      )}

      <div className="panel p-6">
        <p className="section-label mb-3">Live transcript</p>

        <div ref={scrollRef} className="max-h-[45vh] overflow-y-auto text-[15px] leading-relaxed">
          {!transcript && !interim && (
            <p className="text-ink-soft">
              {status === "connecting" ? "Connecting…" : "Start speaking — words will appear here."}
            </p>
          )}
          {/* Committed text is solid; interim words Deepgram may still revise are
              muted, so the doctor can tell what's settled and what isn't. */}
          <p>
            <span>{transcript}</span>
            {interim && <span className="text-ink-soft"> {interim}</span>}
          </p>
        </div>
      </div>

      <p className="text-xs text-ink-soft mt-4 leading-relaxed">
        Audio is transcribed by Deepgram with data retention opted out, and is not stored by RxVoice.
      </p>
    </div>
  );
}
