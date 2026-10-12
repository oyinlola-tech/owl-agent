import { create } from "zustand";

interface ServiceConnectionState {
  authFailed: boolean;
}

export const useServiceConnectionStore = create<ServiceConnectionState>(() => ({ authFailed: false }));

export function markServiceAuthFailed(): void {
  if (!useServiceConnectionStore.getState().authFailed) useServiceConnectionStore.setState({ authFailed: true });
}

export function markServiceAuthWorking(): void {
  if (useServiceConnectionStore.getState().authFailed) useServiceConnectionStore.setState({ authFailed: false });
}
