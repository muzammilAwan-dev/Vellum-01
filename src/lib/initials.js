// ═══════════════════════════════════════════════════════════════
// INITIALS + AVATAR TONE (pure; the Avatar component and the tests use these)
// ═══════════════════════════════════════════════════════════════
const TITLES = new Set(["dr", "mr", "mrs", "ms", "prof"]);
const LETTER = /\p{L}/u;

const firstLetter = (word) => Array.from(word).find((ch) => LETTER.test(ch)) ?? "";

/**
 * "Dr. R. Chen" → "RC", "Maya Okafor" → "MO", "Madonna" → "M", "" → "?".
 * First letters of the first and last word, ignoring titles and words with no
 * letters. Works for any script (Urdu has no case, so nothing is upper-cased there).
 */
export const initialsOf = (name) => {
  const words = String(name ?? "")
    .split(/\s+/)
    .filter((w) => w && !TITLES.has(w.replace(/\.$/, "").toLowerCase()) && firstLetter(w));
  if (!words.length) return "?";
  const letters = words.length === 1 ? [words[0]] : [words[0], words[words.length - 1]];
  return letters.map((w) => firstLetter(w).toUpperCase()).join("");
};

// Six token pairs (full class names, so Tailwind can see them). Every pair keeps
// 4.5:1 text contrast in light and dark; none is red (red reads as an error).
export const AVATAR_TONES = [
  "bg-primary-dim text-primary",
  "bg-success-dim text-success",
  "bg-warning-dim text-warning",
  "bg-raised text-ink-2",
  "bg-ink text-bg",
  "bg-primary text-on-primary",
];

/** Stable tone index (0–5) for a name: the same person always gets the same colour. */
export const avatarToneIndex = (name) => {
  const s = String(name ?? "").trim().toLowerCase();
  let h = 5381;
  for (const ch of s) h = ((h * 33) ^ ch.codePointAt(0)) >>> 0;
  return h % AVATAR_TONES.length;
};

export const avatarTone = (name) => AVATAR_TONES[avatarToneIndex(name)];
