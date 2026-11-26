import { useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/cn";

// ── Textarea that grows with its text ──
// Never cuts a question or answer mid-line. CSS `field-sizing: content` where the browser has it,
// and a measured height everywhere else (set after render, never during it).
export const AutoTextarea = ({ value, minRows = 1, className, ...props }) => {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || CSS.supports?.("field-sizing", "content")) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      rows={minRows}
      className={cn("resize-none overflow-hidden [field-sizing:content]", className)}
      {...props}
    />
  );
};
