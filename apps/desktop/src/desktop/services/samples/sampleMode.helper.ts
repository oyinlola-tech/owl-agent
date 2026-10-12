export async function loadWithSampleFallback<T>(call: Promise<T>, sample: T): Promise<{ data: T; demo: boolean }> {
  try {
    return { data: await call, demo: false };
  } catch {
    return { data: sample, demo: true };
  }
}

export function daysAgoAt(daysAgo: number, hour = 10, minute = 0): string {
  const t = new Date();
  t.setDate(t.getDate() - daysAgo);
  t.setHours(hour, minute, 0, 0);
  return t.toISOString();
}

export function minutesFromNow(minutes: number): string {
  return new Date(Date.now() + minutes * 60000).toISOString();
}

export const SAMPLE_SAVE_NOTICE = "Sample data. Start the OWL service to save changes.";
export const SAMPLE_SAVE_NOTICE_SHORT = "Sample data — start the service to save changes";
