// AudioWorklet that converts the mic's Float32 samples to 16-bit PCM (linear16)
// and posts them to the main thread, which forwards them to Deepgram.
//
// Why this instead of MediaRecorder: MediaRecorder emits webm/opus where only the
// FIRST chunk carries the container header. Any socket reconnect or recorder
// restart mid-dictation leaves Deepgram with headerless chunks it cannot decode
// (DATA-0000). Raw PCM is stateless — every buffer stands alone — so reconnecting
// is trivial. This is also what Deepgram's own current browser SDK does.
//
// Lives in public/ because addModule() needs a real URL.

class PcmCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    // No input yet (or the track ended) — keep the node alive regardless.
    if (!input || input.length === 0) return true;

    const channel = input[0];
    if (!channel || channel.length === 0) return true;

    const pcm = new Int16Array(channel.length);
    for (let i = 0; i < channel.length; i++) {
      // Clamp before scaling: values outside [-1, 1] would wrap and produce audible
      // clicks that the transcriber reads as noise.
      const s = Math.max(-1, Math.min(1, channel[i]));
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    this.port.postMessage(pcm.buffer, [pcm.buffer]);
    return true;
  }
}

registerProcessor("pcm-capture", PcmCaptureProcessor);
