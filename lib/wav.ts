// Minimal WAV support for voice notes: the transcription API accepts mono integer PCM at 16 or
// 24 kHz in a RIFF/WAVE container, and nothing else.
export const VOICE_SAMPLE_RATE = 16_000;
export const MAX_VOICE_NOTE_SECONDS = 60;
const HEADER_BYTES = 44;

/** 16-bit mono PCM WAV from samples in [-1, 1]. */
export function encodeWav(samples: Float32Array, sampleRate = VOICE_SAMPLE_RATE): ArrayBuffer {
  const buffer = new ArrayBuffer(HEADER_BYTES + samples.length * 2);
  const view = new DataView(buffer);
  const text = (offset: number, value: string) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // integer PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => {
    const clamped = Math.max(-1, Math.min(1, s));
    view.setInt16(HEADER_BYTES + i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  });
  return buffer;
}

export interface WavInfo {
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  durationMs: number;
}

/** Reads the format of a PCM WAV file, or returns an error message. */
export function readWavInfo(bytes: Uint8Array): WavInfo | { error: string } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (bytes.length < HEADER_BYTES || tag(0) !== "RIFF" || tag(8) !== "WAVE") return { error: "The audio must be a WAV file." };

  let format: Omit<WavInfo, "durationMs"> | undefined;
  for (let offset = 12; offset + 8 <= bytes.length; ) {
    const id = tag(offset);
    const size = view.getUint32(offset + 4, true);
    if (id === "fmt " && size >= 16 && offset + 24 <= bytes.length) {
      if (view.getUint16(offset + 8, true) !== 1) return { error: "The audio must be integer PCM." };
      format = {
        channels: view.getUint16(offset + 10, true),
        sampleRate: view.getUint32(offset + 12, true),
        bitsPerSample: view.getUint16(offset + 22, true),
      };
    } else if (id === "data" && format) {
      const bytesPerSecond = format.sampleRate * format.channels * (format.bitsPerSample / 8);
      const dataBytes = Math.min(size, bytes.length - offset - 8);
      return { ...format, durationMs: Math.round((dataBytes / bytesPerSecond) * 1000) };
    }
    offset += 8 + size + (size % 2);
  }
  return { error: "The WAV file has no audio data." };
}
