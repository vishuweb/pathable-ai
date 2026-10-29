"use client";

import { useEffect, useRef, useState } from "react";
import { canRecordVoice, startVoiceRecording, type VoiceRecording } from "@/lib/record-voice";
import type { ApiError, TranscribeResponse } from "@/lib/types";
import { MAX_VOICE_NOTE_SECONDS } from "@/lib/wav";

interface Props {
  /** What is being dictated, for the button's accessible name (e.g. "the overall note"). */
  label: string;
  /** Receives the transcript when a recording has been transcribed. */
  onText: (text: string) => void;
}

type State = "idle" | "starting" | "recording" | "transcribing";

/** Dictate into a text field with Muse Voice: press to record, press again to stop. */
export function VoiceNoteButton({ label, onText }: Props) {
  const [supported, setSupported] = useState(false);
  const [state, setState] = useState<State>("idle");
  const [seconds, setSeconds] = useState(0);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const recording = useRef<VoiceRecording | undefined>(undefined);
  // The transcript arrives after an await; use the latest callback so it never writes stale state.
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  const mounted = useRef(true);
  // The auto-stop timer calls the latest stop() without restarting when the component re-renders.
  const stopRef = useRef<() => Promise<void>>(undefined);

  useEffect(() => setSupported(canRecordVoice()), []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      recording.current?.cancel();
    };
  }, []);

  useEffect(() => {
    if (state !== "recording") return;
    const started = Date.now();
    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - started) / 1000);
      setSeconds(elapsed);
      if (elapsed >= MAX_VOICE_NOTE_SECONDS) void stopRef.current?.();
    }, 250);
    return () => clearInterval(timer);
  }, [state]);

  if (!supported) return null;

  const report = (text: string, error = false) => {
    setMessage(text);
    setIsError(error);
  };

  const start = async () => {
    setState("starting");
    report("");
    try {
      const started = await startVoiceRecording();
      // The page may have moved on while the browser asked for microphone access.
      if (!mounted.current) return started.cancel();
      recording.current = started;
      setSeconds(0);
      setState("recording");
      report("Recording. Speak now, then press Stop.");
    } catch (error) {
      setState("idle");
      const denied = error instanceof DOMException && error.name === "NotAllowedError";
      report(denied ? "Microphone access was blocked. Allow it in your browser to dictate." : "The microphone could not be started.", true);
    }
  };

  async function stop() {
    const current = recording.current;
    if (!current) return;
    recording.current = undefined;
    setState("transcribing");
    report("Transcribing your note…");
    try {
      const wav = await current.stop();
      const res = await fetch("/api/transcribe", { method: "POST", headers: { "Content-Type": "audio/wav" }, body: wav });
      const data = (await res.json().catch(() => undefined)) as TranscribeResponse | ApiError | undefined;
      if (!res.ok || !data || "error" in data) throw new Error(data && "error" in data ? data.error : "The note could not be transcribed.");
      if (!data.text) {
        report("No speech was heard. Please try again.", true);
      } else {
        onTextRef.current(data.text);
        report(`Added: “${data.text}”`);
      }
    } catch (error) {
      report(error instanceof Error ? error.message : "The note could not be transcribed.", true);
    } finally {
      setState("idle");
    }
  }

  stopRef.current = stop;
  const recordingNow = state === "recording";
  return (
    <div className="voice-note">
      <button
        type="button"
        className="button-secondary voice-button"
        onClick={() => void (recordingNow ? stop() : start())}
        disabled={state === "starting" || state === "transcribing"}
        aria-label={recordingNow ? `Stop recording ${label}` : `Dictate ${label}`}
      >
        <span aria-hidden="true" className={recordingNow ? "voice-dot is-recording" : "voice-dot"} />
        {recordingNow
          ? `Stop (${seconds}s / ${MAX_VOICE_NOTE_SECONDS}s)`
          : state === "transcribing"
            ? "Transcribing…"
            : "Dictate"}
      </button>
      <span className={isError ? "field-error voice-message" : "muted voice-message"} role="status">
        {message}
      </span>
    </div>
  );
}

/** Appends dictated text to a field's value, within its maximum length. */
export function appendDictation(current: string, text: string, maxLength: number): string {
  const joined = current.trim() ? `${current.trimEnd()} ${text}` : text;
  return joined.slice(0, maxLength);
}
