/**
 * Break a label into at most `maxLines` lines of at most `maxChars` characters,
 * breaking at spaces, ending with "…" when it doesn't all fit. Used for SVG
 * chart labels, where CSS can't wrap or truncate text (Recharts' own wrapping
 * depends on font-load timing and clips the label's start when it misses).
 */
export const wrapLabel = (text, maxChars, maxLines = 2) => {
  const words = String(text ?? "").trim().split(/\s+/).filter(Boolean);
  if (!words.length || maxChars < 2) return [];
  const clip = (w) => (w.length > maxChars ? `${w.slice(0, maxChars - 1)}…` : w);
  const lines = [];
  let line = "";
  let i = 0;
  for (; i < words.length; i++) {
    const next = line ? `${line} ${words[i]}` : words[i];
    if (next.length <= maxChars) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    if (lines.length === maxLines) {
      line = "";
      break;
    }
    line = clip(words[i]);
  }
  if (line) lines.push(line);
  if (lines.length > maxLines || i < words.length) {
    const kept = lines.slice(0, maxLines);
    const last = kept[maxLines - 1] ?? "";
    kept[maxLines - 1] = last.length >= maxChars ? `${last.slice(0, maxChars - 1)}…` : `${last}…`;
    return kept;
  }
  return lines;
};
