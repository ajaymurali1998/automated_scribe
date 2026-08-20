// Shared (browser-safe) Deepgram wiring: the stream URL, the connection handshake,
// and the message shapes. The API key lives in lib/deepgram-server.ts and never
// reaches this module.

export const LISTEN_URL = "wss://api.deepgram.com/v1/listen";
export const SAMPLE_RATE = 16_000;

// Deepgram closes the socket after 10s with no frames at all (NET-0001). A dictation
// app pauses constantly, so KeepAlive goes out well inside that window.
export const KEEPALIVE_INTERVAL_MS = 3_000;

// Streaming params. Two of these matter more than they look:
//
//   mip_opt_out=true   Opts the request out of Deepgram's Model Improvement
//                      Program, so audio is retained only as long as needed to
//                      process it. It is PER-REQUEST, not an account setting, so it
//                      must be on every connection. This is RxVoice's entire
//                      data-retention posture until a BAA is in place.
//
//   encoding/sample_rate  We send raw linear16 PCM from an AudioWorklet, not
//                      MediaRecorder webm/opus — see public/pcm-worklet.js for why.
//                      Raw audio REQUIRES both params; containerized audio must omit
//                      them. Getting this pair wrong is the difference between a
//                      transcript and a stream of DATA-0000 errors.
//
// diarize is OFF unless the caller opts in (see DIARIZE_ENABLED below). When true this
// sends `diarize_model=latest` — NOT the deprecated `diarize=true`, and never both;
// Deepgram rejects a request setting both. Streaming only ever runs the older v1
// diarizer regardless of which form is used (v2 is batch-only), and pairing with
// nova-3-medical is undocumented — Deepgram's compatibility text says "Nova batch
// models" while the streaming feature table says "all available". Treat this as
// unverified until tested against a live connection.
export function buildListenUrl(keyterms: string[], diarize = false): string {
  const params = new URLSearchParams({
    model: "nova-3-medical",
    // en-IN, not en-US — these are Indian doctors speaking Indian-accented English.
    language: "en-IN",
    encoding: "linear16",
    sample_rate: String(SAMPLE_RATE),
    smart_format: "true",
    interim_results: "true",
    punctuate: "true",
    mip_opt_out: "true",
  });

  if (diarize) params.set("diarize_model", "latest");

  // One repeated `keyterm=` per term. Comma-separating them does not error — it
  // silently becomes a single useless literal keyterm. URLSearchParams handles the
  // encoding of multi-word terms like "Folic Acid".
  for (const term of keyterms) params.append("keyterm", term);

  return `${LISTEN_URL}?${params.toString()}`;
}

// Speaker labeling for Section F of the prompt (see lib/prompts.ts) is a real cost
// ($0.0020/min on streaming) with real accuracy risk in a busy, far-field clinic
// recording, so it defaults off. Flip with NEXT_PUBLIC_RXVOICE_DIARIZE=true once
// you've confirmed on live audio that labels help more than they cost — see the
// verification section in the plan.
export const DIARIZE_ENABLED = process.env.NEXT_PUBLIC_RXVOICE_DIARIZE === "true";

// ---------------------------------------------------------------------------
// Handshake auth.
//
// This is the one genuinely under-documented part of Deepgram's browser story. A
// browser WebSocket cannot set an Authorization header, and Deepgram only documents
// the subprotocol form for the LONG-LIVED API key:
//     new WebSocket(url, ["token", API_KEY])
// For short-lived grant tokens (JWTs) the docs show only `Authorization: Bearer`,
// which is unreachable from a browser. Deepgram staff have said JWTs require the
// Bearer scheme; the community also reports an undocumented ?access_token= param.
//
// Rather than hardcode a guess, we try the candidates in order and remember the one
// that works. That resolves the unknown on first run and keeps working if Deepgram
// changes which form they accept. The winner is cached in localStorage so only the
// very first recording ever pays the extra handshake attempts.
// ---------------------------------------------------------------------------

export type AuthStrategy = "subprotocol-bearer" | "query-access-token" | "subprotocol-token";

export const AUTH_STRATEGIES: AuthStrategy[] = [
  "subprotocol-bearer",
  "query-access-token",
  "subprotocol-token",
];

const CACHE_KEY = "rxvoice:dg-auth-strategy";

export function cachedStrategy(): AuthStrategy | null {
  try {
    const v = localStorage.getItem(CACHE_KEY);
    return AUTH_STRATEGIES.includes(v as AuthStrategy) ? (v as AuthStrategy) : null;
  } catch {
    return null;
  }
}

function rememberStrategy(s: AuthStrategy): void {
  try {
    localStorage.setItem(CACHE_KEY, s);
  } catch {
    // Private browsing / storage disabled — we just re-probe next time.
  }
}

function openWith(url: string, token: string, strategy: AuthStrategy): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    let socket: WebSocket;
    try {
      if (strategy === "query-access-token") {
        socket = new WebSocket(`${url}&access_token=${encodeURIComponent(token)}`);
      } else {
        const scheme = strategy === "subprotocol-bearer" ? "bearer" : "token";
        socket = new WebSocket(url, [scheme, token]);
      }
    } catch (e) {
      reject(e);
      return;
    }

    // A rejected handshake surfaces to the browser as an error followed by close
    // code 1006 — the real 401 is deliberately hidden from script. So "closed
    // before it ever opened" is our only available signal for "auth refused".
    const onOpen = () => {
      cleanup();
      resolve(socket);
    };
    const onClose = () => {
      cleanup();
      reject(new Error(`handshake rejected (${strategy})`));
    };

    function cleanup() {
      socket.removeEventListener("open", onOpen);
      socket.removeEventListener("close", onClose);
      socket.removeEventListener("error", onClose);
    }

    socket.addEventListener("open", onOpen);
    socket.addEventListener("close", onClose);
    socket.addEventListener("error", onClose);
  });
}

// Opens an authenticated stream, probing auth forms only as needed.
export async function connectDeepgram(url: string, token: string): Promise<WebSocket> {
  const known = cachedStrategy();
  const order = known ? [known, ...AUTH_STRATEGIES.filter((s) => s !== known)] : AUTH_STRATEGIES;

  let lastError: unknown = null;
  for (const strategy of order) {
    try {
      const socket = await openWith(url, token, strategy);
      if (strategy !== known) {
        console.info(`[deepgram] authenticated via "${strategy}"`);
        rememberStrategy(strategy);
      }
      return socket;
    } catch (e) {
      lastError = e;
      // A grant token is single-use for a handshake in practice; but since every
      // attempt here failed to open, the token was never consumed. Keep probing.
    }
  }

  console.error("[deepgram] every auth strategy was rejected", lastError);
  throw new Error("Could not authenticate the transcription stream.");
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

// Word-level detail, present when diarization is on. speaker is an integer speaker
// id — an acoustic guess, not a verified identity (see Section F of the prompt).
export type DeepgramWord = {
  word: string;
  punctuated_word?: string;
  speaker?: number;
};

// Shape of the streaming Results message. is_final and speech_final are optional in
// Deepgram's own schema, so they are optional here too — guard before trusting them.
export type DeepgramResult = {
  type?: string;
  is_final?: boolean;
  speech_final?: boolean;
  channel?: { alternatives?: Array<{ transcript?: string; words?: DeepgramWord[] }> };
};

export function transcriptOf(msg: DeepgramResult): string {
  return msg.channel?.alternatives?.[0]?.transcript ?? "";
}

export function wordsOf(msg: DeepgramResult): DeepgramWord[] {
  return msg.channel?.alternatives?.[0]?.words ?? [];
}

// A contiguous run of words from one speaker id.
export type SpeakerBlock = { speaker: number; text: string };

// Appends words onto the running speaker-block list, merging into the last block when
// the speaker id is unchanged. Deliberately only ever called with words from
// is_final results — Deepgram's docs don't state whether interim speaker ids are
// stable, and community reports suggest they revise as more audio arrives, so
// building labeled text from interim data risks a transcript that doesn't match what
// the doctor saw on screen.
export function appendSpeakerWords(blocks: SpeakerBlock[], words: DeepgramWord[]): void {
  for (const w of words) {
    const speaker = w.speaker ?? 0;
    const text = w.punctuated_word || w.word;
    if (!text) continue;

    const last = blocks[blocks.length - 1];
    if (last && last.speaker === speaker) {
      last.text = `${last.text} ${text}`;
    } else {
      blocks.push({ speaker, text });
    }
  }
}

// Renders accumulated speaker blocks as "Speaker N: ..." lines for the structuring
// prompt. Consecutive blocks from the same speaker (e.g. across two Results messages)
// are merged so a mid-sentence Deepgram flush doesn't fragment one utterance into two
// labeled lines.
export function renderSpeakerBlocks(blocks: SpeakerBlock[]): string {
  const merged: SpeakerBlock[] = [];
  for (const b of blocks) {
    const last = merged[merged.length - 1];
    if (last && last.speaker === b.speaker) last.text = `${last.text} ${b.text}`;
    else merged.push({ ...b });
  }
  return merged.map((b) => `Speaker ${b.speaker}: ${b.text}`).join("\n");
}
