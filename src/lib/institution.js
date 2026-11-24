// ═══════════════════════════════════════════════════════════════
// INSTITUTION SETTINGS (pure; the fake server and the admin form share them, the real server ports them — B15)
// One institution per installation. Every signed-in role reads it (report headers, Profile header);
// only an administrator changes it.
// ═══════════════════════════════════════════════════════════════
import { isValidPhone, PHONE_MAX } from "./profile";

export const INSTITUTION_DEFAULTS = {
  name: "Westfield Institute",
  shortName: "Westfield",
  city: "",
  phone: "",
  email: "",
  logo: null,
  allowStudentPhotos: false,
  updatedAt: null,
};
export const INSTITUTION_FIELDS = ["name", "shortName", "city", "phone", "email", "logo", "allowStudentPhotos"];
export const LIMITS = { name: 80, shortName: 30, city: 60, email: 120 };
export const LOGO_MAX_BYTES = 100 * 1024;
export const LOGO_MAX_WIDTH = 256;

const LOGO_RE = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** What anyone may see before signing in (login page, tab title): name and logo only, never contacts or policy. */
export const brandingOf = (i) => ({ name: i.name, shortName: i.shortName, logo: i.logo ?? null });

/** Decoded size of a base64 data URL, in bytes. */
export const logoBytes = (dataUrl) => {
  const i = String(dataUrl).indexOf(",");
  const b64 = String(dataUrl).slice(i + 1);
  return Math.floor((b64.length * 3) / 4) - (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0);
};

/** Scale (w, h) down to at most `max` wide, keeping the shape; never scales up. */
export const fitWidth = (w, h, max = LOGO_MAX_WIDTH) =>
  w <= max ? { w, h } : { w: max, h: Math.max(1, Math.round((h * max) / w)) };

/** Checks a PUT body (a partial update). Returns `{ field: message }`, or null when valid. */
export const validateInstitutionPatch = (patch) => {
  const errors = {};
  const p = patch ?? {};
  const keys = Object.keys(p);
  const unknown = keys.filter((k) => !INSTITUTION_FIELDS.includes(k));
  if (unknown.length) errors._ = `You can't change ${unknown.join(", ")} here`;
  else if (!keys.length) errors._ = "Nothing to change";
  const str = (k, { required = false } = {}) => {
    if (!(k in p)) return;
    if (typeof p[k] !== "string") return void (errors[k] = "Enter text");
    const v = p[k].trim();
    if (required && !v) errors[k] = "This can't be empty";
    else if (v.length > LIMITS[k]) errors[k] = `Keep it under ${LIMITS[k]} characters`;
  };
  str("name", { required: true });
  str("shortName", { required: true });
  str("city");
  if ("phone" in p) {
    if (typeof p.phone !== "string") errors.phone = "Enter a phone number";
    else if (p.phone.trim().length > PHONE_MAX) errors.phone = `Keep it under ${PHONE_MAX} characters`;
    else if (!isValidPhone(p.phone.trim())) errors.phone = "Use digits, +, spaces and dashes only";
  }
  if ("email" in p) {
    const e = typeof p.email === "string" ? p.email.trim() : null;
    if (e === null) errors.email = "Enter an email address";
    else if (e && (e.length > LIMITS.email || !EMAIL_RE.test(e))) errors.email = "Enter a valid email address";
  }
  if ("logo" in p && p.logo !== null) {
    if (typeof p.logo !== "string" || !LOGO_RE.test(p.logo)) errors.logo = "Use a PNG or JPEG image";
    else if (logoBytes(p.logo) > LOGO_MAX_BYTES) errors.logo = "The logo must be under 100 KB";
  }
  if ("allowStudentPhotos" in p && typeof p.allowStudentPhotos !== "boolean") errors.allowStudentPhotos = "Must be on or off";
  return Object.keys(errors).length ? errors : null;
};

/** Field names whose value differs (never the values themselves: they go in no log). */
export const institutionChangedFields = (before, after) =>
  INSTITUTION_FIELDS.filter((k) => (before?.[k] ?? INSTITUTION_DEFAULTS[k]) !== (after?.[k] ?? INSTITUTION_DEFAULTS[k]));
