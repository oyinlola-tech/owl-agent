import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import {
  combineDraftWithTranscript,
  isVoiceDictationSupported,
  useVoiceDictation,
  voiceNoticeForStatus,
} from "./useVoiceDictation.hook";

interface EmittedResult {
  isFinal: boolean;
  transcript: string;
}

class MockRecognition {
  static instances: MockRecognition[] = [];
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  onresult: ((event: { resultIndex: number; results: EmittedResult[] }) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  started = false;
  aborted = false;

  constructor() {
    MockRecognition.instances.push(this);
  }

  start() {
    this.started = true;
  }

  stop() {
    this.started = false;
    this.onend?.();
  }

  abort() {
    this.aborted = true;
    this.started = false;
  }

  emit(results: EmittedResult[]) {
    this.onresult?.({
      resultIndex: 0,
      results: results.map((r) => ({ ...r, 0: { transcript: r.transcript } })),
    });
  }
}

function installMock() {
  MockRecognition.instances = [];
  (window as unknown as Record<string, unknown>).webkitSpeechRecognition = MockRecognition;
}

function uninstallMock() {
  delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
  delete (window as unknown as Record<string, unknown>).SpeechRecognition;
}

afterEach(() => {
  cleanup();
  uninstallMock();
  vi.restoreAllMocks();
});

describe("isVoiceDictationSupported", () => {
  it("is false when no SpeechRecognition API exists", () => {
    expect(isVoiceDictationSupported()).toBe(false);
  });

  it("is true when webkitSpeechRecognition exists", () => {
    installMock();
    expect(isVoiceDictationSupported()).toBe(true);
  });
});

describe("voiceNoticeForStatus", () => {
  it("announces denied/unavailable and stays silent otherwise", () => {
    expect(voiceNoticeForStatus("denied")).toMatch(/denied/i);
    expect(voiceNoticeForStatus("denied")).toMatch(/typing still works/i);
    expect(voiceNoticeForStatus("unavailable")).toMatch(/unavailable/i);
    expect(voiceNoticeForStatus("idle")).toBeNull();
    expect(voiceNoticeForStatus("listening")).toBeNull();
    expect(voiceNoticeForStatus("unsupported")).toBeNull();
  });
});

describe("combineDraftWithTranscript", () => {
  it("appends transcripts with spacing", () => {
    expect(combineDraftWithTranscript("", "hello")).toBe("hello");
    expect(combineDraftWithTranscript("hi", "there")).toBe("hi there");
    expect(combineDraftWithTranscript("hi ", "there")).toBe("hi there");
    expect(combineDraftWithTranscript("hi", "")).toBe("hi");
  });
});

describe("useVoiceDictation", () => {
  it("reports unsupported and never starts without the API", () => {
    const { result } = renderHook(() => useVoiceDictation());
    expect(result.current.supported).toBe(false);
    expect(result.current.status).toBe("unsupported");
    act(() => result.current.start());
    expect(result.current.status).toBe("unsupported");
  });

  it("streams interim text and reports final text", () => {
    installMock();
    const onInterimText = vi.fn();
    const onFinalText = vi.fn();
    const { result } = renderHook(() => useVoiceDictation({ onInterimText, onFinalText }));

    act(() => result.current.start());
    expect(result.current.listening).toBe(true);
    expect(MockRecognition.instances).toHaveLength(1);

    act(() => MockRecognition.instances[0].emit([{ isFinal: false, transcript: "hello wo" }]));
    expect(onInterimText).toHaveBeenLastCalledWith("hello wo");
    expect(onFinalText).not.toHaveBeenCalled();

    act(() => MockRecognition.instances[0].emit([{ isFinal: true, transcript: "hello world" }]));
    expect(onFinalText).toHaveBeenLastCalledWith("hello world");
  });

  it("stops listening on demand", () => {
    installMock();
    const { result } = renderHook(() => useVoiceDictation());
    act(() => result.current.start());
    expect(result.current.listening).toBe(true);
    act(() => result.current.stop());
    expect(result.current.listening).toBe(false);
    expect(result.current.status).toBe("idle");
  });

  it("toggles between listening and idle", () => {
    installMock();
    const { result } = renderHook(() => useVoiceDictation());
    act(() => result.current.toggle());
    expect(result.current.listening).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.listening).toBe(false);
  });

  it("maps permission denial to the denied state", () => {
    installMock();
    const { result } = renderHook(() => useVoiceDictation());
    act(() => result.current.start());
    act(() => MockRecognition.instances[0].onerror?.({ error: "not-allowed" }));
    expect(result.current.status).toBe("denied");
    expect(result.current.notice).toMatch(/denied/i);
    act(() => result.current.dismissNotice());
    expect(result.current.status).toBe("idle");
  });

  it("maps service failures to the unavailable state", () => {
    installMock();
    const { result } = renderHook(() => useVoiceDictation());
    act(() => result.current.start());
    act(() => MockRecognition.instances[0].onerror?.({ error: "network" }));
    expect(result.current.status).toBe("unavailable");
    expect(result.current.notice).toMatch(/unavailable/i);
  });

  it("returns to idle when the engine ends", () => {
    installMock();
    const { result } = renderHook(() => useVoiceDictation());
    act(() => result.current.start());
    act(() => MockRecognition.instances[0].stop());
    expect(result.current.status).toBe("idle");
  });
});
