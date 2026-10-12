import { fileIconForPath } from "../../../../shared/helpers/fileIcon.helper";

export function FileGlyph({ name, size = 15 }: { name: string; size?: number }) {
  const fileIcon = fileIconForPath(name);
  return <fileIcon.icon size={size} weight="duotone" style={{ color: fileIcon.color, flex: "none" }} />;
}
