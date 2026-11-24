// ═══════════════════════════════════════════════════════════════
// PARENT CONTACT RULES (F12c1) — pure; the fake server and the forms share them,
// the real server ports them (B14). A student has an optional guardianName and
// guardianPhone. The phone is stored normalised (92 + 10 digits), shown masked,
// and never written to the audit log. Only Pakistani mobile numbers are accepted
// for now (open decision 26: numbers abroad).
// ═══════════════════════════════════════════════════════════════
export const GUARDIAN_NAME_MAX = 80;
export const GUARDIAN_FIELDS = ["name", "phone"];

/**
 * "0300-1234567", "+92 300 1234567", "0092 300 1234567", "923001234567" → "923001234567".
 * Anything else (landline, wrong length, letters, another country) → null.
 * Mobile numbers are 3 + [0-5] + 8 digits after the trunk 0 (Jazz 30x/32x, Zong 31x, Ufone 33x, Telenor 34x, SCOM 355).
 */
export const normalizePkPhone = (input) => {
  if (typeof input !== "string") return null;
  const s = input.trim();
  if (!s || s.length > 30 || !/^\+?[\d\s\-().]+$/.test(s)) return null;
  let d = s.replace(/\D/g, "");
  if (d.startsWith("0092")) d = d.slice(4);
  else if (d.startsWith("92")) d = d.slice(2);
  if (d.startsWith("0")) d = d.slice(1); // "+92 (0) 300 …" and "0300 …"
  return /^3[0-5]\d{8}$/.test(d) ? `92${d}` : null;
};

/** "923001234567" → "+92 300 ••• 4567" (empty string when it is not a valid number). */
export const maskPhone = (phone) => {
  const n = normalizePkPhone(phone ?? "");
  return n ? `+92 ${n.slice(2, 5)} ••• ${n.slice(-4)}` : "";
};

/** What a teacher types into the box: "0300-1234567". */
export const localPhone = (phone) => {
  const n = normalizePkPhone(phone ?? "");
  return n ? `0${n.slice(2, 5)}-${n.slice(5)}` : "";
};

// WhatsApp click-to-chat (WhatsApp Help Center "How to use click to chat", checked Nov 2026):
//   https://wa.me/<full international number: digits only, no +, 0s, brackets or dashes>?text=<URL-encoded text>
export const WA_URL_BUDGET = 2000; // our own safe cap for the whole link (browsers and apps cut very long links)
const SAMPLE_NUMBER = "923001234567";

export const toWaLink = (phone, text = "") => {
  const n = normalizePkPhone(phone ?? "");
  if (!n) return null;
  return `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
};

/** Does the message fit in one link? A space costs 3 characters, a newline 3, an Urdu letter 6 (two UTF-8 bytes). */
export const fitsWhatsApp = (text) => toWaLink(SAMPLE_NUMBER, text ?? "").length <= WA_URL_BUDGET;

/** The cleaned value a server stores: name trimmed with single spaces, phone normalised ("" = none). */
export const cleanGuardian = (input) => ({
  name: String(input?.name ?? "").trim().replace(/\s+/g, " "),
  phone: String(input?.phone ?? "").trim() === "" ? "" : normalizePkPhone(String(input.phone)) ?? "",
});

/** Checks a PUT body `{ name?, phone? }`. Returns `{ field: message }`, or null when valid. Empty = remove. */
export const validateGuardian = (input) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { _: "Send the parent's name and number" };
  const errors = {};
  const keys = Object.keys(input);
  const unknown = keys.filter((k) => !GUARDIAN_FIELDS.includes(k));
  if (unknown.length) errors._ = `You can't set ${unknown.join(", ")} here`;
  else if (!keys.length) errors._ = "Nothing to change";
  if ("name" in input) {
    if (typeof input.name !== "string") errors.name = "Enter the parent's name";
    else if (input.name.trim().length > GUARDIAN_NAME_MAX) errors.name = `Keep the name under ${GUARDIAN_NAME_MAX} characters`;
    // eslint-disable-next-line no-control-regex -- control characters are exactly what is refused here
    else if (/[\u0000-\u001f\u007f<>]/.test(input.name)) errors.name = "The name has characters that aren't allowed";
  }
  if ("phone" in input) {
    if (typeof input.phone !== "string") errors.phone = "Enter a mobile number";
    else if (input.phone.trim() !== "" && !normalizePkPhone(input.phone)) {
      errors.phone = "Enter a Pakistani mobile number, like 0300-1234567";
    }
  }
  return Object.keys(errors).length ? errors : null;
};

/** Which of `name` / `phone` differ between two `{name, phone}` values (field names only: safe for the audit log). */
export const guardianChanged = (before, after) =>
  GUARDIAN_FIELDS.filter((k) => (before?.[k] ?? "") !== (after?.[k] ?? ""));

/** The wire shape for people allowed to see it: the stored values and the masked number. */
export const guardianView = ({ guardianName, guardianPhone } = {}) => ({
  name: guardianName ?? "",
  phone: guardianPhone ?? "",
  masked: maskPhone(guardianPhone),
});
