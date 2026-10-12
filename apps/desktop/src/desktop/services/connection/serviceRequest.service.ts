import { getServiceToken } from "./serviceToken.service";
import { markServiceAuthFailed, markServiceAuthWorking } from "./serviceConnection.store";

export const SERVICE_BASE_URL = (import.meta.env.VITE_OWL_SERVICE_URL as string | undefined) ?? "http://127.0.0.1:8000";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const UNAUTHENTICATED_PATHS = new Set(["/health"]);
const UNAUTHORIZED_STATUS = 401;

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function isServiceAuthError(error: unknown): boolean {
  return error instanceof ApiError && error.status === UNAUTHORIZED_STATUS;
}

export async function buildServiceHeaders(method: string, extraHeaders?: HeadersInit): Promise<Headers> {
  const headers = new Headers(extraHeaders);
  const token = await getServiceToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (MUTATING_METHODS.has(method.toUpperCase()) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return headers;
}

export async function fetchFromService(path: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = await buildServiceHeaders(method, init.headers);
  const response = await fetch(`${SERVICE_BASE_URL}${path}`, { ...init, method, headers });
  if (response.status === UNAUTHORIZED_STATUS) markServiceAuthFailed();
  else if (response.ok && !UNAUTHENTICATED_PATHS.has(path)) markServiceAuthWorking();
  return response;
}

async function readApiError(response: Response): Promise<ApiError> {
  const body = (await response.json().catch(() => null)) as { detail?: unknown; code?: unknown } | null;
  const fallbackCode = response.status === UNAUTHORIZED_STATUS ? "unauthorized" : "http_error";
  const code = typeof body?.code === "string" ? body.code : fallbackCode;
  const detail = typeof body?.detail === "string" ? body.detail : `request failed with ${response.status}`;
  return new ApiError(response.status, code, detail);
}

export async function requestServiceJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetchFromService(path, init);
  if (!response.ok) throw await readApiError(response);
  return response.json() as Promise<T>;
}

export async function buildEventStreamUrl(path: string): Promise<string> {
  // Security: EventSource can't send headers, so the event stream is the one route where the
  // service accepts the token as ?token=.
  const token = await getServiceToken();
  const separator = path.includes("?") ? "&" : "?";
  return token ? `${SERVICE_BASE_URL}${path}${separator}token=${encodeURIComponent(token)}` : `${SERVICE_BASE_URL}${path}`;
}

export async function loadServiceImageAsObjectUrl(path: string): Promise<string> {
  const response = await fetchFromService(path);
  if (!response.ok) throw await readApiError(response);
  return URL.createObjectURL(await response.blob());
}
