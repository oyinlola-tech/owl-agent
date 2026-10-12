import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { agentApi } from "../agentApi.service";
import { loadWithSampleFallback } from "../samples/sampleMode.helper";
import { forgetServiceToken } from "./serviceToken.service";
import { markServiceAuthWorking, useServiceConnectionStore } from "./serviceConnection.store";
import { ServiceAuthErrorPanel } from "../../layout/serviceAuthError.layout";

const TEST_TOKEN = "unit-test-token-0123456789abcdef";

type RecordedCall = { url: string; method: string; headers: Headers };

function mockServiceResponses(status: number, body: unknown): RecordedCall[] {
  const calls: RecordedCall[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, method: init.method ?? "GET", headers: new Headers(init.headers) });
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }));
  return calls;
}

class RecordingEventSource {
  static urls: string[] = [];
  constructor(url: string) {
    RecordingEventSource.urls.push(url);
  }
  addEventListener() {}
  close() {}
}

beforeEach(() => {
  vi.stubEnv("VITE_OWL_DEV_TOKEN", TEST_TOKEN);
  forgetServiceToken();
  markServiceAuthWorking();
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  forgetServiceToken();
});

describe("service requests carry the service token", () => {
  it("attaches the bearer token to GET requests", async () => {
    const calls = mockServiceResponses(200, []);
    await agentApi.backendTasks();
    expect(calls[0].method).toBe("GET");
    expect(calls[0].headers.get("Authorization")).toBe(`Bearer ${TEST_TOKEN}`);
  });

  it("attaches the bearer token and JSON content type to POST requests with a body", async () => {
    const calls = mockServiceResponses(200, { saved: true });
    await agentApi.saveMemory("preference", "Use tabs", "owl");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].headers.get("Authorization")).toBe(`Bearer ${TEST_TOKEN}`);
    expect(calls[0].headers.get("Content-Type")).toBe("application/json");
  });

  it("sends a JSON content type on POST requests without a body", async () => {
    const calls = mockServiceResponses(200, { id: "t1" });
    await agentApi.pauseBackendTask("t1");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].headers.get("Content-Type")).toBe("application/json");
    expect(calls[0].headers.get("Authorization")).toBe(`Bearer ${TEST_TOKEN}`);
  });

  it("puts the token in the event stream URL", async () => {
    RecordingEventSource.urls = [];
    vi.stubGlobal("EventSource", RecordingEventSource);
    const stop = agentApi.events("task-7", () => {});
    await vi.waitFor(() => expect(RecordingEventSource.urls).toHaveLength(1));
    const streamUrl = new URL(RecordingEventSource.urls[0]);
    expect(streamUrl.pathname).toBe("/tasks/task-7/events");
    expect(streamUrl.searchParams.get("token")).toBe(TEST_TOKEN);
    stop();
  });
});

describe("authentication failures", () => {
  it("turns a 401 into the auth-error state instead of sample data", async () => {
    mockServiceResponses(401, { detail: "missing or invalid service token", code: "unauthorized" });
    const sample = [{ id: "sample-task" }];
    await expect(loadWithSampleFallback(agentApi.backendTasks() as Promise<unknown>, sample)).rejects.toMatchObject({ status: 401 });
    expect(useServiceConnectionStore.getState().authFailed).toBe(true);
    render(createElement(ServiceAuthErrorPanel));
    expect(screen.getByText("Can't authenticate with the local OWL service")).toBeTruthy();
    expect(screen.getAllByText(/VITE_OWL_DEV_TOKEN/).length).toBeGreaterThan(0);
  });

  it("keeps sample data when the service is offline", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    const sample = [{ id: "sample-task" }];
    const result = await loadWithSampleFallback(agentApi.backendTasks() as Promise<unknown>, sample);
    expect(result).toEqual({ data: sample, demo: true });
    expect(useServiceConnectionStore.getState().authFailed).toBe(false);
  });
});
