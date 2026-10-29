// Browser-side voice notes: records from the microphone in whatever format the browser supports,
// then decodes and resamples it to the 16 kHz mono WAV the transcription API accepts.
import { VOICE_SAMPLE_RATE, encodeWav } from "./wav";

export interface VoiceRecording {
  /** Stops recording and returns the note as WAV. */
  stop(): Promise<Blob>;
  /** Stops recording and discards it. */
  cancel(): void;
}

export function canRecordVoice(): boolean {
  return typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
}

export async function startVoiceRecording(): Promise<VoiceRecording> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });
  const release = () => stream.getTracks().forEach((track) => track.stop());
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream);
  } catch (error) {
    release();
    throw error;
  }
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };
  const stopped = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));
  recorder.start();

  return {
    async stop() {
      if (recorder.state !== "inactive") recorder.stop();
      await stopped;
      release();
      return toWav(new Blob(chunks, { type: recorder.mimeType }));
    },
    cancel() {
      if (recorder.state !== "inactive") recorder.stop();
      release();
    },
  };
}

async function toWav(recording: Blob): Promise<Blob> {
  const context = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await context.decodeAudioData(await recording.arrayBuffer());
  } finally {
    void context.close();
  }
  // Rendering into a one-channel context at the target rate downmixes and resamples in one step.
  const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * VOICE_SAMPLE_RATE)), VOICE_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  return new Blob([encodeWav(rendered.getChannelData(0))], { type: "audio/wav" });
}
