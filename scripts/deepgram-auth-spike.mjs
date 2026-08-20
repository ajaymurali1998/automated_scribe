#!/usr/bin/env node
// Resolves the one genuinely undocumented part of Deepgram's browser story: which
// handshake form authenticates a short-lived grant token over a WebSocket.
//
// Deepgram documents the subprotocol form only for the LONG-LIVED API key:
//     new WebSocket(url, ["token", API_KEY])
// For grant tokens (JWTs) the docs show only `Authorization: Bearer`, which a browser
// WebSocket cannot send. Staff have said JWTs need the Bearer scheme; the community
// also reports an undocumented ?access_token= query param. Nobody documents the
// browser-reachable form, so we test it.
//
// This reproduces the browser's constraint faithfully by never setting an auth
// header — only subprotocols or query params, exactly like `new WebSocket(...)`.
// What Deepgram accepts is server-side behaviour, so Node is a valid probe.
//
// Usage:
//   DEEPGRAM_API_KEY=... node scripts/deepgram-auth-spike.mjs
//
// The winning strategy name matches the AuthStrategy union in lib/deepgram.ts.
// Record the result in docs/TECHNICAL_DESIGN.md.

import { WebSocket } from "ws";

const KEY = process.env.DEEPGRAM_API_KEY;
if (!KEY) {
  console.error("DEEPGRAM_API_KEY is not set.");
  process.exit(1);
}

const GRANT_URL = "https://api.deepgram.com/v1/auth/grant";

// Same params the app uses, so this also confirms nova-3-medical + keyterm + the
// linear16 pair are all accepted together on streaming.
const params = new URLSearchParams({
  model: "nova-3-medical",
  language: "en-IN",
  encoding: "linear16",
  sample_rate: "16000",
  smart_format: "true",
  interim_results: "true",
  punctuate: "true",
  mip_opt_out: "true",
});
for (const t of ["Metformin", "Dolo", "Pan-D", "Folic Acid"]) params.append("keyterm", t);
const LISTEN_URL = `wss://api.deepgram.com/v1/listen?${params}`;

async function mint() {
  const res = await fetch(GRANT_URL, {
    method: "POST",
    headers: { Authorization: `Token ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ttl_seconds: 60 }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`grant failed ${res.status}: ${text}`);
  const json = JSON.parse(text);
  if (!json.access_token) throw new Error(`grant returned no access_token: ${text}`);
  return json;
}

// Half a second of 16kHz silence-with-a-tone, so a successful connection actually
// gets decodable audio rather than just completing a handshake.
function toneFrames() {
  const total = 8000; // 0.5s @ 16kHz
  const pcm = new Int16Array(total);
  for (let i = 0; i < total; i++) {
    pcm[i] = Math.round(Math.sin((2 * Math.PI * 440 * i) / 16000) * 3000);
  }
  const frames = [];
  const per = 1600; // 100ms chunks
  for (let o = 0; o < total; o += per) {
    frames.push(Buffer.from(pcm.buffer, o * 2, per * 2));
  }
  return frames;
}

function attempt(strategy, token) {
  return new Promise((resolve) => {
    let ws;
    const url = strategy === "query-access-token"
      ? `${LISTEN_URL}&access_token=${encodeURIComponent(token)}`
      : LISTEN_URL;

    try {
      if (strategy === "query-access-token") {
        ws = new WebSocket(url);
      } else {
        const scheme = strategy === "subprotocol-bearer" ? "bearer" : "token";
        // Note: no headers option. That is the point — browsers cannot set them.
        ws = new WebSocket(url, [scheme, token]);
      }
    } catch (e) {
      resolve({ strategy, ok: false, detail: `constructor threw: ${e.message}` });
      return;
    }

    let opened = false;
    let transcriptSeen = false;

    const done = (result) => {
      clearTimeout(timer);
      try {
        ws.close();
      } catch {}
      resolve(result);
    };

    const timer = setTimeout(
      () => done({ strategy, ok: opened, detail: opened ? "opened, no transcript in 6s" : "timed out" }),
      6000
    );

    ws.on("upgrade", (res) => {
      // Node exposes the handshake response the browser hides. Useful signal.
      if (res.statusCode && res.statusCode >= 400) {
        done({ strategy, ok: false, detail: `HTTP ${res.statusCode}` });
      }
    });

    ws.on("open", () => {
      opened = true;
      for (const f of toneFrames()) ws.send(f);
      ws.send(JSON.stringify({ type: "CloseStream" }));
    });

    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (msg.type === "Results") transcriptSeen = true;
      if (msg.type === "Metadata") {
        done({ strategy, ok: true, detail: transcriptSeen ? "opened + Results + Metadata" : "opened + Metadata" });
      }
    });

    ws.on("close", (code) => {
      if (!opened) done({ strategy, ok: false, detail: `closed before open (code ${code})` });
    });

    ws.on("error", (err) => {
      if (!opened) done({ strategy, ok: false, detail: err.message });
    });
  });
}

const STRATEGIES = ["subprotocol-bearer", "query-access-token", "subprotocol-token"];

console.log("Minting a grant token…");
const grant = await mint();
console.log(`  ok — expires_in=${grant.expires_in}s\n`);

const winners = [];
for (const strategy of STRATEGIES) {
  // A fresh token per attempt so a consumed token can't skew a later result.
  const { access_token } = await mint();
  process.stdout.write(`${strategy.padEnd(22)} … `);
  const r = await attempt(strategy, access_token);
  console.log(`${r.ok ? "WORKS" : "fails"}  (${r.detail})`);
  if (r.ok) winners.push(strategy);
}

console.log();
if (winners.length) {
  console.log(`✓ Use "${winners[0]}" in lib/deepgram.ts.`);
  if (winners.length > 1) console.log(`  (also accepted: ${winners.slice(1).join(", ")})`);
  console.log("  Record this in docs/TECHNICAL_DESIGN.md.");
} else {
  console.log("✗ No grant-token strategy worked.");
  console.log("  Fall back to a short-TTL PROJECT API KEY with the documented");
  console.log('  ["token", key] form — see docs/TECHNICAL_DESIGN.md.');
  process.exitCode = 1;
}
