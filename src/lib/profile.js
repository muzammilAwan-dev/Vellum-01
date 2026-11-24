// ═══════════════════════════════════════════════════════════════
// PROFILE RULES (pure; the fake server and the form share them, the real server ports them)
// Identity fields (name, email, role, roll number, class) are admin-only and never
// appear here. A user edits bio, phone and preferences.
// ═══════════════════════════════════════════════════════════════
import { validateSummaryPrefs } from "./summary";

export const BIO_MAX = 200;
export const PHONE_MAX = 20;
export const PREFS_MAX_BYTES = 2048;
export const EDITABLE_FIELDS = ["bio", "phone", "prefs"];

const PHONE_OK = /^[0-9+\-\s]*$/;
export const isValidPhone = (s) => PHONE_OK.test(s);
const byteLength = (v) => new TextEncoder().encode(JSON.stringify(v)).length;

/**
 * Checks a PATCH body. Returns `{ field: message }`, or null when it is valid.
 * `prefsAfter` = the merged preferences object (so the 2 KB cap applies to what is stored).
 */
export const validateProfilePatch = (patch, prefsAfter) => {
  const errors = {};
  const keys = Object.keys(patch ?? {});
  const unknown = keys.filter((k) => !EDITABLE_FIELDS.includes(k));
  if (unknown.length) errors._ = `You can't change ${unknown.join(", ")} here`;
  else if (!keys.length) errors._ = "Nothing to change";
  if ("bio" in (patch ?? {})) {
    if (typeof patch.bio !== "string") errors.bio = "Write a short text";
    else if (patch.bio.length > BIO_MAX) errors.bio = `Keep it under ${BIO_MAX} characters`;
  }
  if ("phone" in (patch ?? {})) {
    if (typeof patch.phone !== "string") errors.phone = "Enter a phone number";
    else if (patch.phone.length > PHONE_MAX) errors.phone = `Keep it under ${PHONE_MAX} characters`;
    else if (!PHONE_OK.test(patch.phone)) errors.phone = "Use digits, +, spaces and dashes only";
  }
  if ("prefs" in (patch ?? {})) {
    const p = patch.prefs;
    if (p === null || typeof p !== "object" || Array.isArray(p)) errors.prefs = "Preferences must be an object";
    else if (byteLength(prefsAfter ?? p) > PREFS_MAX_BYTES) errors.prefs = "Preferences are too large";
    else if (p.parentSummary != null) {
      const bad = validateSummaryPrefs(p.parentSummary); // F12c2: the teacher's parent-message style
      if (bad) errors.prefs = Object.values(bad)[0];
    }
  }
  return Object.keys(errors).length ? errors : null;
};

/** Top-level merge; a key set to null is removed. */
export const mergePrefs = (current, patch) => {
  const out = { ...(current ?? {}), ...patch };
  for (const k of Object.keys(out)) if (out[k] === null) delete out[k];
  return out;
};
