import { AlignLeft, FileText, Play } from "lucide-react";
import { cn } from "@/lib/cn";

const ICONS = { video: Play, file: FileText, text: AlignLeft };

export const LessonIcon = ({ kind, size = 32 }) => {
  const Icon = ICONS[kind] ?? AlignLeft;
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-[10px]",
        kind === "video" && "bg-danger-dim text-danger",
        kind === "file" && "bg-warning-dim text-warning",
        kind === "text" && "bg-primary-dim text-primary",
      )}
      style={{ width: size, height: size }}
    >
      <Icon size={Math.round(size * 0.5)} strokeWidth={2} fill={kind === "video" ? "currentColor" : "none"} />
    </span>
  );
};
