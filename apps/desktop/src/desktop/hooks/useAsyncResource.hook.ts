import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, isServiceAuthError } from "../services/connection/serviceRequest.service";

export type ResourceStatus = "loading" | "ready" | "error";

export interface ResourceState<T> {
  data: T | null;
  status: ResourceStatus;
  error: ApiError | null;
  unauthorized: boolean;
  offline: boolean;
  reload: () => void;
}

export function classifyResourceError(error: unknown): { unauthorized: boolean; offline: boolean; error: ApiError | null } {
  if (isServiceAuthError(error)) return { unauthorized: true, offline: false, error: error as ApiError };
  if (error instanceof ApiError) return { unauthorized: false, offline: false, error };
  return { unauthorized: false, offline: true, error: null };
}

export function useAsyncResource<T>(loader: (signal: AbortSignal) => Promise<T>, deps: readonly unknown[] = []): ResourceState<T> {
  const [data, setData] = useState<T | null>(null);
  const [status, setStatus] = useState<ResourceStatus>("loading");
  const [error, setError] = useState<ApiError | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [offline, setOffline] = useState(false);
  const [nonce, setNonce] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    setStatus("loading");
    setError(null);
    setUnauthorized(false);
    setOffline(false);
    loaderRef.current(controller.signal)
      .then((result) => {
        if (!alive) return;
        setData(result);
        setStatus("ready");
      })
      .catch((caught) => {
        if (!alive || controller.signal.aborted) return;
        const classified = classifyResourceError(caught);
        setUnauthorized(classified.unauthorized);
        setOffline(classified.offline);
        setError(classified.error);
        setStatus("error");
      });
    return () => {
      alive = false;
      controller.abort();
    };

  }, [nonce, ...deps]);
  return { data, status, error, unauthorized, offline, reload };
}
