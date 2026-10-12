export function readStoredValue(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStoredValue(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    return;
  }
}

export function readStoredFlag(key: string, fallback: boolean): boolean {
  const value = readStoredValue(key);
  return value === null ? fallback : value === "1";
}

export function writeStoredFlag(key: string, value: boolean) {
  writeStoredValue(key, value ? "1" : "0");
}

export function removeStoredKeysStartingWith(prefix: string) {
  try {
    Object.keys(window.localStorage)
      .filter((key) => key.startsWith(prefix))
      .forEach((key) => window.localStorage.removeItem(key));
  } catch {
    return;
  }
}
