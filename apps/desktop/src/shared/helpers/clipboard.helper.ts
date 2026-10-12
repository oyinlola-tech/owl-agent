export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function copyTextAndNotify(
  text: string,
  notify: (message: string) => void,
  successMessage = "Copied",
  failureMessage = "Clipboard blocked. Select and copy manually.",
) {
  void copyTextToClipboard(text).then((copied) => notify(copied ? successMessage : failureMessage));
}
