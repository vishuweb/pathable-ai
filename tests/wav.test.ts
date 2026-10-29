import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeWav, readWavInfo } from "../lib/wav";

test("encoded voice notes are 16-bit mono WAV the API accepts", () => {
  const wav = new Uint8Array(encodeWav(new Float32Array(16_000)));
  assert.equal(wav.length, 44 + 32_000);
  assert.deepEqual(readWavInfo(wav), { channels: 1, sampleRate: 16_000, bitsPerSample: 16, durationMs: 1000 });
});

test("samples are clamped to full scale", () => {
  const wav = new Uint8Array(encodeWav(Float32Array.from([2, -2, 0.5])));
  const view = new DataView(wav.buffer);
  assert.deepEqual([view.getInt16(44, true), view.getInt16(46, true)], [0x7fff, -0x8000]);
});

test("invalid audio is rejected with a reason", () => {
  assert.deepEqual(readWavInfo(new Uint8Array(10)), { error: "The audio must be a WAV file." });
  const float = new Uint8Array(encodeWav(new Float32Array(100)));
  new DataView(float.buffer).setUint16(20, 3, true);
  assert.deepEqual(readWavInfo(float), { error: "The audio must be integer PCM." });
});
