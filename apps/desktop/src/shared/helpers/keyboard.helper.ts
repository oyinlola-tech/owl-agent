export function isTypingInTextField(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return element.isContentEditable
    || /^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName)
    || !!element.closest?.(".monaco-editor");
}
