"use client";

// Owns the whole live-dictation lifecycle: mic permission, the 16kHz AudioWorklet,
// the Deepgram socket, KeepAlive, the elapsed timer, and one reconnect attempt.
//
// It is a hook rather than inline JSX because the teardown ordering genuinely
// matters — a leaked AudioContext keeps the mic indicator lit in the browser tab,
// which on a doctor's machine looks like the app is still listening after they
// stopped. Every exit path funnels through teardown().

import { useCallback, useEffect, useRef, useState } from "react";

import {
  DIARIZE_ENABLED,
  KEEPALIVE_INTERVAL_MS,
  SAMPLE_RATE,
  appendSpeakerWords,
  buildListenUrl,
  connectDeepgram,
  renderSpeakerBlocks,
  transcriptOf,
  wordsOf,
  type DeepgramResult,
  type SpeakerBlock,
} from "@/lib/deepgram";
import { INDIAN_DRUG_KEYTERMS } from "@/lib/prompts";

export type DictationStatus = "idle" | "connecting" | "recording" | "paused" | "error";

export type Dictation = {
  status: DictationStatus;
  /** Committed (is_final) text. This is what gets sent for structuring. */
  transcript: string;
  /** In-flight words Deepgram may still revise. Render these muted. */
  interim: string;
  /** Seconds of actual recording, excluding paused time. */
  elapsed: number;
  error: string | null;
  /** Set when the stream dropped but the transcript so far is still good. */
  warning: string | null;
  start: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => Promise<string>;
  reset: () => void;
};

export function useDictation(): Dictation {
  const [status, setStatus] = useState<DictationStatus>("idle");
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const nodeRef = useRef<AudioWorkletNode | null>(null);
  const keepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Refs mirror state for use inside socket callbacks, which close over stale state.
  const pausedRef = useRef(false);
  const stoppingRef = useRef(false);
  const reconnectedRef = useRef(false);
  const transcriptRef = useRef("");
  // Only ever appended to from is_final results — see appendSpeakerWords's comment.
  // Empty and unused when DIARIZE_ENABLED is false.
  const speakerBlocksRef = useRef<SpeakerBlock[]>([]);
  // Breaks the attach <-> reconnect cycle: attach's close handler needs to call
  // reconnect, and reconnect needs to re-attach to the new socket.
  const reconnectRef = useRef<(() => Promise<void>) | null>(null);

  const teardown = useCallback(() => {
    if (keepAliveRef.current) clearInterval(keepAliveRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
    keepAliveRef.current = null;
    tickRef.current = null;

    nodeRef.current?.port.close();
    nodeRef.current?.disconnect();
    nodeRef.current = null;

    // Stop the tracks before closing the context so the browser's mic indicator
    // clears promptly.
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    void ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;

    const socket = socketRef.current;
    socketRef.current = null;
    if (socket && socket.readyState === WebSocket.OPEN) socket.close();
  }, []);

  // Unmount safety net: navigating away mid-recording must release the mic.
  useEffect(() => teardown, [teardown]);

  const mintToken = useCallback(async (): Promise<string> => {
    const res = await fetch("/api/deepgram-token", { method: "POST" });
    const body = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string };
    if (!res.ok || !body.access_token) {
      throw new Error(body.error || "Could not start transcription.");
    }
    return body.access_token;
  }, []);

  // Wires message/close handlers onto a freshly opened socket.
  const attach = useCallback(
    (socket: WebSocket) => {
      socket.addEventListener("message", (event) => {
        let msg: DeepgramResult;
        try {
          msg = JSON.parse(event.data as string);
        } catch {
          return;
        }

        const text = transcriptOf(msg);
        if (!text) return;

        if (msg.is_final) {
          setInterim("");
          setTranscript((prev) => {
            const next = prev ? `${prev} ${text}` : text;
            transcriptRef.current = next;
            return next;
          });
          // Speaker ids are only trustworthy once Deepgram has committed to a final
          // result — interim speaker assignment is undocumented and may revise.
          if (DIARIZE_ENABLED) appendSpeakerWords(speakerBlocksRef.current, wordsOf(msg));
        } else {
          setInterim(text);
        }
      });

      socket.addEventListener("close", () => {
        // Expected close from stop() — nothing to do.
        if (stoppingRef.current) return;

        // Unexpected drop. Try exactly once more; a reconnect loop on a failing
        // network would silently burn Deepgram minutes. Called through a ref
        // because attach and reconnect are mutually recursive.
        if (!reconnectedRef.current) {
          reconnectedRef.current = true;
          void reconnectRef.current?.();
          return;
        }

        teardown();
        setStatus("error");
        setWarning("Recording interrupted — the transcript so far is preserved, please review.");
      });
    },
    [teardown]
  );

  // Re-opens the socket and re-points the worklet at it. Raw PCM makes this safe:
  // there is no container header to lose, so audio resumes cleanly.
  const reconnect = useCallback(async () => {
    try {
      const token = await mintToken();
      const socket = await connectDeepgram(buildListenUrl(INDIAN_DRUG_KEYTERMS, DIARIZE_ENABLED), token);
      socketRef.current = socket;
      attach(socket);
      setWarning("Reconnected — dictation resumed.");
    } catch {
      teardown();
      setStatus("error");
      setWarning("Recording interrupted — the transcript so far is preserved, please review.");
    }
  }, [attach, mintToken, teardown]);

  reconnectRef.current = reconnect;

  const start = useCallback(async () => {
    setError(null);
    setWarning(null);
    setTranscript("");
    setInterim("");
    setElapsed(0);
    transcriptRef.current = "";
    speakerBlocksRef.current = [];
    pausedRef.current = false;
    stoppingRef.current = false;
    reconnectedRef.current = false;
    setStatus("connecting");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      setStatus("error");
      setError("Microphone access was blocked. Allow it in your browser and try again.");
      return;
    }
    streamRef.current = stream;

    try {
      const token = await mintToken();

      // Ask for 16kHz directly so no resampling is needed before linear16.
      const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
      ctxRef.current = ctx;
      await ctx.audioWorklet.addModule("/pcm-worklet.js");

      const socket = await connectDeepgram(buildListenUrl(INDIAN_DRUG_KEYTERMS, DIARIZE_ENABLED), token);
      socketRef.current = socket;
      attach(socket);

      const source = ctx.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(ctx, "pcm-capture");
      nodeRef.current = node;

      node.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        if (pausedRef.current) return;
        const s = socketRef.current;
        if (s && s.readyState === WebSocket.OPEN) s.send(event.data);
      };

      source.connect(node);
      // Deliberately NOT connected to ctx.destination — routing the mic to the
      // speakers would feed the doctor's own voice back at them.

      // KeepAlive runs through pauses too; that is the whole point of it.
      keepAliveRef.current = setInterval(() => {
        const s = socketRef.current;
        if (s && s.readyState === WebSocket.OPEN) s.send(JSON.stringify({ type: "KeepAlive" }));
      }, KEEPALIVE_INTERVAL_MS);

      tickRef.current = setInterval(() => {
        if (!pausedRef.current) setElapsed((e) => e + 1);
      }, 1000);

      setStatus("recording");
    } catch (e) {
      teardown();
      setStatus("error");
      setError((e as Error)?.message || "Could not start transcription. Please try again.");
    }
  }, [attach, mintToken, teardown]);

  const pause = useCallback(() => {
    pausedRef.current = true;
    setInterim("");
    setStatus("paused");
  }, []);

  const resume = useCallback(() => {
    pausedRef.current = false;
    setStatus("recording");
  }, []);

  // Resolves with the final transcript so the caller doesn't race React state.
  const stop = useCallback(async (): Promise<string> => {
    stoppingRef.current = true;
    pausedRef.current = true;

    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      // CloseStream tells Deepgram to flush buffered audio and send any remaining
      // final results before closing. Give it a moment to arrive.
      socket.send(JSON.stringify({ type: "CloseStream" }));
      await new Promise((r) => setTimeout(r, 600));
    }

    teardown();
    setStatus("idle");
    setInterim("");

    // With diarization on, hand the structuring prompt speaker-labeled text instead
    // of the flat transcript — this is what makes Section F's speaker rule (F.3) able
    // to fire at all. Falls back to plain text if labeling produced nothing (e.g. no
    // words carried a speaker field, which is the documented behavior whenever the
    // undocumented nova-3-medical + diarize_model pairing doesn't actually diarize).
    if (DIARIZE_ENABLED) {
      const labeled = renderSpeakerBlocks(speakerBlocksRef.current);
      if (labeled) return labeled;
    }
    return transcriptRef.current;
  }, [teardown]);

  const reset = useCallback(() => {
    teardown();
    stoppingRef.current = true;
    setStatus("idle");
    setTranscript("");
    setInterim("");
    setElapsed(0);
    setError(null);
    setWarning(null);
    transcriptRef.current = "";
    speakerBlocksRef.current = [];
  }, [teardown]);

  return { status, transcript, interim, elapsed, error, warning, start, pause, resume, stop, reset };
}
