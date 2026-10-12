import {
  File, FileCode, FileCss, FileHtml, FileJs, FileMd, FilePy, FileText, FileTs, FileTsx, type Icon,
} from "@phosphor-icons/react";

const CODE_EXTENSIONS = ["go", "rs", "java", "rb", "c", "cpp", "yaml", "yml", "json", "toml"];

export function fileIconForPath(path: string): { icon: Icon; color: string } {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  if (extension === "ts") return { icon: FileTs, color: "var(--blue)" };
  if (extension === "tsx") return { icon: FileTsx, color: "var(--blue)" };
  if (extension === "js" || extension === "jsx" || extension === "mjs") return { icon: FileJs, color: "var(--yellow)" };
  if (extension === "go") return { icon: FileCode, color: "var(--blue)" };
  if (extension === "py") return { icon: FilePy, color: "var(--yellow)" };
  if (extension === "md") return { icon: FileMd, color: "var(--gray)" };
  if (extension === "css") return { icon: FileCss, color: "var(--purple)" };
  if (extension === "html") return { icon: FileHtml, color: "var(--orange)" };
  if (CODE_EXTENSIONS.includes(extension)) return { icon: FileCode, color: "var(--ink-3)" };
  if (extension === "txt") return { icon: FileText, color: "var(--ink-3)" };
  return { icon: File, color: "var(--ink-3)" };
}
