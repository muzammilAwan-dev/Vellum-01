import { sha256Hex } from "./sha256";

// ═══════════════════════════════════════════════════════════════
// AUDIT RULES (pure, no UI or mock imports; the real server ports this file).
// The log is an append-only hash chain: each event stores the hash of the
// previous one, so editing or removing an entry breaks every hash after it.
// That makes tampering *evident*; it does not make it impossible (see
// docs/specs/F11-F13-audit-reports-profiles.md §2 and B1b).
// ═══════════════════════════════════════════════════════════════
export const GENESIS = "0".repeat(64);

/** A mark change this large (share of the question's marks) must carry a reason. */
export const REASON_RATIO = 0.25;
export const REASON_MAX_LENGTH = 500;

export const AUDIT_TYPES = {
  "auth.login": "Signed in",
  "auth.login_failed": "Failed sign-in",
  "auth.password_changed": "Password changed",
  "auth.password_reset": "Password reset by an administrator",
  "user.create": "Account created",
  "user.update": "Account changed",
  "user.delete": "Account removed",
  "profile.update": "Profile changed",
  "institution.update": "Institution settings changed",
  "privacy.update": "Privacy policy changed",
  "profile.photo_set": "Photo added or changed",
  "profile.photo_removed": "Photo removed",
  "guardian.update": "Parent contact changed",
  "class.create": "Class created",
  "class.update": "Class changed",
  "class.delete": "Class removed",
  "test.generate": "Test generated",
  "test.regenerate": "Test regenerated",
  "test.duplicate": "Test duplicated",
  "test.update": "Test edited after publishing",
  "test.delete": "Test deleted",
  "test.publish": "Test published",
  "test.start_now": "Test started early",
  "test.stop_now": "Test stopped",
  "test.extend": "Time extended",
  "attempt.start": "Student started a test",
  "attempt.submit": "Test submitted",
  "grade.ai_draft": "AI drafted a mark",
  "grade.override": "Teacher changed a mark",
  "grade.approve": "Teacher approved a mark",
  "grade.manual": "Teacher marked an answer",
  "grade.feedback": "Teacher edited feedback",
  "audit.view": "Audit data viewed",
  "audit.export": "Audit log exported",
  "report.generate": "Report generated",
  "report.export": "Report exported",
};

/** Stable JSON: object keys sorted, undefined dropped, no whitespace. */
export const canonicalJson = (value) => {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v === undefined ? null : v)).join(",")}]`;
  return `{${Object.keys(value)
    .filter((k) => value[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`)
    .join(",")}}`;
};

/** The fields a hash covers: everything except the id and the two hashes. */
export const eventBody = (event) => {
  const { _id, prevHash, hash, ...body } = event; // eslint-disable-line no-unused-vars
  return body;
};

export const hashEvent = (prevHash, body) => sha256Hex(`${prevHash}\n${canonicalJson(body)}`);

/** → { ok: true, checked } or { ok: false, badSeq, reason: "seq" | "prev" | "hash" } (first failure). */
export const verifyChain = (events) => {
  let prev = GENESIS;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.seq !== i + 1) return { ok: false, badSeq: e.seq ?? i + 1, reason: "seq" };
    if (e.prevHash !== prev) return { ok: false, badSeq: e.seq, reason: "prev" };
    if (e.hash !== hashEvent(prev, eventBody(e))) return { ok: false, badSeq: e.seq, reason: "hash" };
    prev = e.hash;
  }
  return { ok: true, checked: events.length };
};

/**
 * Must a teacher explain this mark change?
 *  - after the result was released: any change to a final mark;
 *  - otherwise: a change that moves the mark by REASON_RATIO of the question's
 *    marks or more, measured from the AI's mark when there is one (so several
 *    small nudges can't add up to a big one unseen).
 * `current` is the mark now, `to` the new one; a first-time manual mark (current
 * null) and an unchanged mark never need a reason.
 */
export const needsReason = ({ max, current, ai = null, to, afterRelease = false }) => {
  if (current == null || to == null || to === current) return false;
  if (afterRelease) return true;
  return Math.abs(to - (ai ?? current)) >= REASON_RATIO * max;
};
