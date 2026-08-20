import type { NextConfig } from "next";

// Content-Security-Policy. The browser talks to exactly one external service:
//   - Deepgram (streaming transcription WebSocket) -> connect-src
// Claude and Upstash stay server-side and are deliberately absent here. There is no
// backend on this build (see lib/localStore.ts), so there's no database origin to
// allowlist either.
const deepgram = "https://api.deepgram.com wss://api.deepgram.com";

// Next's dev server (Turbopack HMR, React DevTools call-stack reconstruction) needs
// eval() to function — 'unsafe-eval' is dev-only and never ships in a production
// build. Without this, dev mode throws "eval() is not supported in this environment"
// and React falls back to a slower/degraded debugging path.
const isDev = process.env.NODE_ENV !== "production";
const scriptSrc = isDev ? "'self' 'unsafe-inline' 'unsafe-eval'" : "'self' 'unsafe-inline'";

const csp = [
  "default-src 'self'",
  `script-src ${scriptSrc}`,
  "style-src 'self' 'unsafe-inline'",
  // data: covers the signature (a base64 data URL in localStorage); blob: covers the
  // generated PDF.
  "img-src 'self' data: blob:",
  `connect-src 'self' ${deepgram}`,
  "font-src 'self' data:",
  // The generated PDF is handed to the browser as a blob: URL.
  "object-src 'none'",
  "frame-src 'self' blob:",
  // The AudioWorklet module is same-origin; blob: is here for the PDF renderer.
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // microphone=(self) — NOT microphone=(). This app's entire premise is getUserMedia,
  // and a blanket deny here fails silently and confusingly.
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
