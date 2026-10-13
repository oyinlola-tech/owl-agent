import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceDictationStatus = "unsupported" | "idle" | "listening" | "denied" | "unavailable";

interface DictationAlternative {
  transcript: string;
}

interface DictationResult {
  isFinal: boolean;
  [index: number]: DictationAlternative;
}

interface DictationResultEvent {
  resultIndex: number;
  results: ArrayLike<DictationResult>;
}

interface DictationRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: DictationResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type DictationRecognitionCtor = new () => DictationRecognition;

function recognitionCtor(): DictationRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as Record<string, unknown>;
  const ctor = scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
  return (typeof ctor === "function" ? ctor : null) as DictationRecognitionCtor | null;
}

export function isVoiceDictationSupported(): boolean {
  return recognitionCtor() !== null;
}

export function voiceNoticeForStatus(status: VoiceDictationStatus): string | null {
  if (status === "denied") return "Microphone access was denied. Allow microphone access in your browser to dictate messages. Typing still works.";
  if (status === "unavailable") return "Voice input is unavailable right now. Check your microphone and connection, then try again. Typing still works.";
  return null;
}

export function combineDraftWithTranscript(base: string, transcript: string): string {
  if (!transcript) return base;
  if (!base) return transcript;
  return `${base}${base.endsWith(" ") || base.endsWith("\n") ? "" : " "}${transcript}`;
}

interface UseVoiceDictationOptions {
  onInterimText?: (text: string) => void;
  onFinalText?: (text: string) => void;
}

export function useVoiceDictation(options: UseVoiceDictationOptions = {}) {
  const [supported] = useState(isVoiceDictationSupported);
  const [status, setStatus] = useState<VoiceDictationStatus>(() =>
    isVoiceDictationSupported() ? "idle" : "unsupported",
  );
  const recognitionRef = useRef<DictationRecognition | null>(null);
  const statusRef = useRef(status);
  statusRef.current = status;
  const callbacksRef = useRef(options);
  callbacksRef.current = options;

  const teardown = useCallback(() => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (!recognition) return;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    try {
      recognition.abort();
    } catch {
      /* recognition already stopped */
    }
  }, []);

  const stop = useCallback(() => {
    teardown();
    if (statusRef.current === "listening") setStatus("idle");
  }, [teardown]);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) {
      setStatus("unsupported");
      return;
    }
    teardown();
    const recognition = new Ctor();
    recognition.lang = typeof navigator !== "undefined" && navigator.language ? navigator.language : "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event: DictationResultEvent) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? "";
        if (!transcript) continue;
        if (result.isFinal) final += transcript;
        else interim += transcript;
      }
      if (final) callbacksRef.current.onFinalText?.(final);
      if (interim) callbacksRef.current.onInterimText?.(interim);
    };
    recognition.onerror = (event: { error: string }) => {
      teardown();
      setStatus(event.error === "not-allowed" || event.error === "service-not-allowed" ? "denied" : "unavailable");
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      if (statusRef.current === "listening") setStatus("idle");
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setStatus("listening");
    } catch {
      teardown();
      setStatus("unavailable");
    }
  }, [teardown]);

  const toggle = useCallback(() => {
    if (statusRef.current === "listening") stop();
    else start();
  }, [start, stop]);

  const dismissNotice = useCallback(() => {
    if (statusRef.current === "denied" || statusRef.current === "unavailable") setStatus("idle");
  }, []);

  useEffect(() => teardown, [teardown]);

  return {
    supported,
    status,
    listening: status === "listening",
    notice: voiceNoticeForStatus(status),
    start,
    stop,
    toggle,
    dismissNotice,
  };
}
