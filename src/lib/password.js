// ═══════════════════════════════════════════════════════════════
// PASSWORD RULES (pure; the form and the fake server share them, the real server ports them — B15)
// Follows NIST SP 800-63B-4 (final 2025): length over complexity, no composition rules (no "must have a
// digit/symbol"), spaces and any Unicode allowed, the WHOLE password is checked against a blocklist, and no
// forced periodic change. NIST sets the minimum at 15 characters when a password is the only sign-in factor
// (8 only with a second factor). Vellum has no second factor, so the minimum is 15; it is one constant.
// ═══════════════════════════════════════════════════════════════
export const PASSWORD_MIN_LENGTH = 15;
export const PASSWORD_MAX_LENGTH = 128;

const lengthOf = (s) => Array.from(String(s ?? "")).length; // Unicode characters, not UTF-16 units

// Small built-in list for the demo. The real server must screen against a breached-password corpus (B15).
const COMMON = new Set([
  "password", "password1", "password123", "passwordpassword", "123456789012345", "1234567890123456",
  "qwertyuiopasdfgh", "qwertyuiop123456", "iloveyouiloveyou", "letmeinletmein1", "welcomewelcome1",
  "changemechangeme", "adminadminadmin1", "westfieldschool", "westfieldinstitute", "westfield12345678", "westfieldwestfield",
  "pakistanpakistan1", "abcdefghijklmnop", "abcd1234abcd1234", "11111111111111111", "0123456789abcdef",
]);
const isPattern = (p) => /^(.)\1+$/u.test(p) || /^(.{1,4})\1+$/u.test(p); // "aaaa…", "abcdabcd…"

/** What the password must satisfy, in display order. `text` is the user-facing rule. */
export const PASSWORD_RULES = [
  { code: "TOO_SHORT", text: `At least ${PASSWORD_MIN_LENGTH} characters (a few words with spaces works well)` },
  { code: "SAME_AS_CURRENT", text: "Different from your current password" },
  { code: "CONTAINS_EMAIL", text: "Doesn't contain your email address" },
  { code: "TOO_COMMON", text: "Not a common or easily guessed password" },
];

export const PASSWORD_MESSAGES = {
  TOO_SHORT: `Use at least ${PASSWORD_MIN_LENGTH} characters`,
  TOO_LONG: `Use at most ${PASSWORD_MAX_LENGTH} characters`,
  SAME_AS_CURRENT: "Choose a password you haven't used here before",
  CONTAINS_EMAIL: "Your password can't contain your email address",
  TOO_COMMON: "That password is too common. Try a few unrelated words instead",
};

const emailParts = (email) => {
  const e = String(email ?? "").trim().toLowerCase();
  const local = e.split("@")[0] ?? "";
  return [e, local.length >= 4 ? local : ""].filter(Boolean);
};

const failing = (next, { email, current } = {}) => {
  const p = String(next ?? "");
  const lower = p.toLowerCase();
  return {
    TOO_SHORT: lengthOf(p) < PASSWORD_MIN_LENGTH,
    TOO_LONG: lengthOf(p) > PASSWORD_MAX_LENGTH,
    SAME_AS_CURRENT: current != null && current !== "" && p === current,
    CONTAINS_EMAIL: emailParts(email).some((part) => lower.includes(part)),
    TOO_COMMON: COMMON.has(lower.replace(/[\s-]+/g, "")) || (lengthOf(p) >= PASSWORD_MIN_LENGTH && isPattern(lower)),
  };
};
const ORDER = ["TOO_SHORT", "TOO_LONG", "SAME_AS_CURRENT", "CONTAINS_EMAIL", "TOO_COMMON"];

/** `null` when the password is acceptable, else the first failing code (order: TOO_SHORT, TOO_LONG, SAME_AS_CURRENT, CONTAINS_EMAIL, TOO_COMMON). */
export const validatePassword = (next, ctx) => {
  const f = failing(next, ctx);
  return ORDER.find((c) => f[c]) ?? null;
};

/** For the live checklist: every rule with `ok`. An empty field shows nothing as met. */
export const passwordChecks = (next, ctx) => {
  const f = failing(next, ctx);
  const started = String(next ?? "") !== "";
  return PASSWORD_RULES.map((r) => ({ ...r, ok: started && !f[r.code] && !(r.code === "TOO_SHORT" && f.TOO_LONG) }));
};

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // 31 symbols, no 0/o/1/l/i

/**
 * "kx7m-qp3w-zr9t-hn4c": 16 random characters in 4 groups (no look-alike characters, ~79 bits).
 * Uses crypto.getRandomValues with rejection sampling (no modulo bias). The real server uses its own CSPRNG.
 */
export const generateTemporaryPassword = (getBytes = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n))) => {
  const out = [];
  while (out.length < 16) {
    for (const b of getBytes(32)) {
      if (b < 248 && out.length < 16) out.push(ALPHABET[b % ALPHABET.length]); // 248 = 31 × 8
    }
  }
  return out.join("").replace(/(.{4})(?=.)/g, "$1-");
};
