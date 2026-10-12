import { fileIconForPath } from "../../shared/helpers/fileIcon.helper";

export function FilePath({ path }: { path: string }) {
  const FileIcon = fileIconForPath(path).icon;
  return (
    <span className="x-path">
      <FileIcon size={15} />
      <span>{path}</span>
    </span>
  );
}
