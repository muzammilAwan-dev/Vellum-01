import { useState } from "react";
import { cn } from "@/lib/cn";
import { avatarTone, initialsOf } from "@/lib/initials";

// ═══════════════════════════════════════════════════════════════
// AVATAR
//   <Avatar name="Maya Okafor" size="md" />                       stands alone → role="img" + aria-label
//   <Avatar name={t.author} size="sm" decorative />                name is shown beside it → hidden from screen readers
//   <Avatar name src={photoUrl} />                                 photo, falls back to initials if it fails to load
// Initials are the real design (most people have no photo); the photo is the enhancement.
// tone: "brand" = gold chip on the dark sidebar · "teacher" = highlighted staff author in discussions ·
//       "neutral" = plain grey; omit it and the colour comes from the name (stable per person).
// ═══════════════════════════════════════════════════════════════
const SIZES = {
  sm: "size-7 text-[11px]",
  md: "size-9 text-[13px]",
  lg: "size-14 text-[18px]",
  xl: "size-24 text-[30px]",
};

const TONES = {
  brand: "bg-sidebar-accent text-sidebar-bg",
  teacher: "bg-primary-dim text-primary",
  neutral: "bg-raised text-ink-2",
};

export const Avatar = ({ name, src, size = "md", decorative = false, tone, className }) => {
  const [failed, setFailed] = useState(null); // the src that failed (a new src gets a fresh try)
  const showPhoto = Boolean(src) && failed !== src;
  const shape = cn(
    "relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full font-semibold leading-none select-none",
    SIZES[size] ?? SIZES.md,
    TONES[tone] ?? avatarTone(name),
    className,
  );
  const a11y = decorative
    ? { "aria-hidden": true }
    : { role: "img", "aria-label": name || "Unknown user" };

  return (
    <span className={shape} {...a11y}>
      {showPhoto ? (
        <img
          src={src}
          alt=""
          className="size-full object-cover"
          draggable={false}
          onError={() => setFailed(src)}
        />
      ) : (
        <span aria-hidden="true">{initialsOf(name)}</span>
      )}
    </span>
  );
};
