import { AUDIT_TYPES } from "./audit";

// ═══════════════════════════════════════════════════════════════
// AUDIT EVENT EXPLORER RULES (pure; the real server ports this file)
// Filtering, one-line descriptions and the CSV layout for the admin's event log.
// ═══════════════════════════════════════════════════════════════
export const EVENT_GROUPS = [
  { id: "grading", label: "Grading", types: ["grade.ai_draft", "grade.override", "grade.approve", "grade.manual", "grade.feedback"] },
  { id: "tests", label: "Tests", types: ["test.generate", "test.regenerate", "test.duplicate", "test.update", "test.delete", "test.publish", "test.start_now", "test.stop_now", "test.extend"] },
  { id: "attempts", label: "Attempts", types: ["attempt.start", "attempt.submit"] },
  { id: "accounts", label: "Accounts and classes", types: ["user.create", "user.update", "user.delete", "profile.update", "profile.photo_set", "profile.photo_removed", "guardian.update", "institution.update", "privacy.update", "class.create", "class.update", "class.delete"] },
  { id: "access", label: "Sign-ins and audit access", types: ["auth.login", "auth.login_failed", "auth.password_changed", "auth.password_reset", "audit.view", "audit.export"] },
  { id: "reports", label: "Reports", types: ["report.generate", "report.export"] },
];

/**
 * Filters: actor (id, or "system"), group, type, entityType, classId, testId,
 * studentId, from / to (ISO timestamps, both inclusive). Empty values are ignored.
 */
export const filterEvents = (events, f = {}) => {
  const types = f.group ? new Set(EVENT_GROUPS.find((g) => g.id === f.group)?.types ?? []) : null;
  return events.filter((e) => {
    if (f.actor && (f.actor === "system" ? e.actor?.role !== "system" : e.actor?.id !== f.actor)) return false;
    if (types && !types.has(e.type)) return false;
    if (f.type && e.type !== f.type) return false;
    if (f.entityType && e.entity?.type !== f.entityType) return false;
    if (f.classId && e.classId !== f.classId) return false;
    if (f.testId && e.testId !== f.testId) return false;
    if (f.studentId && e.studentId !== f.studentId) return false;
    if (f.from && e.at < f.from) return false;
    if (f.to && e.at > f.to) return false;
    return true;
  });
};

const marks = (side) => (side?.marks == null ? "no mark" : String(side.marks));

/** One line of detail for an event. `names` = { users: {id: name}, tests: {id: title} }. */
export const describeEvent = (e, names = {}) => {
  const student = names.users?.[e.studentId] ?? (e.studentId ? "a student" : "");
  const test = names.tests?.[e.testId] ?? "";
  const max = e.meta?.max != null ? ` / ${e.meta.max}` : "";
  const reason = e.meta?.reason ? ` Reason: “${e.meta.reason}”.` : "";
  const late = e.meta?.afterRelease ? " After release." : "";
  switch (e.type) {
    case "grade.ai_draft":
      return `${student}: AI drafted ${marks(e.after)}${max}${e.after?.confidence != null ? ` (confidence ${Math.round(e.after.confidence * 100)}%)` : ""}.`;
    case "grade.override":
      return `${student}: ${marks(e.before)} → ${marks(e.after)}${max}${e.meta?.aiMarks != null ? ` (AI gave ${e.meta.aiMarks})` : ""}.${reason}${late}`;
    case "grade.approve":
      return `${student}: approved ${marks(e.after)}${max}${e.meta?.bulk ? " (bulk)" : ""}.`;
    case "grade.manual":
      return `${student}: marked ${marks(e.after)}${max}.`;
    case "grade.feedback":
      return `${student}: feedback edited.${late}`;
    case "attempt.start":
      return `${student}${test ? ` started ${test}` : ""}.`;
    case "attempt.submit":
      return `${student}${test ? ` submitted ${test}` : ""} (${e.meta?.reason ?? "submitted"}).`;
    case "test.extend":
      return `${test}: +${e.meta?.minutes ?? "?"} min.`;
    case "test.update":
      return `${test}: changed ${(e.meta?.changed ?? []).join(", ") || "settings"}${e.meta?.afterAttempts ? " after students had started" : ""}.`;
    case "test.delete":
      return `${e.before?.title ?? test} (${e.meta?.attempts ?? 0} attempts).`;
    case "test.generate":
    case "test.regenerate":
    case "test.duplicate":
    case "test.publish":
    case "test.start_now":
    case "test.stop_now":
      return `${test}.`;
    case "user.create":
      return `New ${e.after?.role ?? "user"} account.`;
    case "user.update":
      return `Changed ${Object.keys(e.after ?? {}).join(", ") || "account"}.`;
    case "auth.password_changed":
      return "Changed their own password.";
    case "auth.password_reset":
      return `Temporary password issued for ${names.users?.[e.entity?.id] ?? "an account"}.`;
    case "profile.photo_set":
      return "Set a profile photo.";
    case "profile.photo_removed":
      return e.meta?.by === "admin" ? `Removed the photo of ${names.users?.[e.entity?.id] ?? "an account"}.` : "Removed their profile photo.";
    case "privacy.update":
      return `Changed the privacy policy ${(e.meta?.changed ?? []).join(" and ") || "settings"} (version ${e.meta?.version ?? "?"}).`;
    case "institution.update":
      return `Changed institution ${(e.meta?.changed ?? []).join(", ") || "settings"}.`;
    case "guardian.update":
      return `Changed parent contact ${(e.meta?.changed ?? []).join(" and ") || "details"} of ${names.users?.[e.entity?.id] ?? "a student"}.`;
    case "profile.update":
      return `Changed ${(e.meta?.changed ?? []).join(", ") || "profile"}.`;
    case "user.delete":
      return `${e.before?.name ?? "Account"} (${e.before?.role ?? "user"}) removed.`;
    case "class.create":
      return `${e.after?.name ?? "Class"}.`;
    case "class.update":
      return `Changed ${Object.keys(e.after ?? {}).join(", ") || "class"}.`;
    case "class.delete":
      return `${e.before?.name ?? "Class"}.`;
    case "auth.login":
      return e.meta?.email ?? "";
    case "auth.login_failed":
      return `${e.meta?.email ?? ""}${e.meta?.code ? ` (${e.meta.code})` : ""}.`;
    case "audit.view":
      return e.meta?.what === "teacher-profile" ? "Opened a teacher's marking profile." : "Opened a test's grading trail.";
    case "report.generate":
      return `${e.meta?.preset === "test" ? "Test" : "Progress"} report prepared.`;
    case "report.export":
      return `Report ${e.meta?.channel === "pdf" ? "saved as PDF" : e.meta?.channel === "whatsapp" ? "opened in WhatsApp" : "text copied"}.`;
    case "audit.export":
      return `${e.meta?.rows ?? 0} rows.`;
    default:
      return "";
  }
};

export const EMPTY_FILTERS = { group: "", actor: "", type: "", from: "", to: "" };

// Dates are picked as local days; the server compares ISO timestamps.
export const dayStart = (v) => (v ? new Date(`${v}T00:00:00`).toISOString() : "");
export const dayEnd = (v) => (v ? new Date(`${v}T23:59:59.999`).toISOString() : "");

export const EVENT_LABEL = (type) => AUDIT_TYPES[type] ?? type;

export const EVENT_CSV_HEADER = ["#", "Time (UTC)", "Who", "Role", "What", "Details", "Test", "Student", "Hash"];

/** Rows for lib/csv.js (events newest or oldest first, as given). */
export const eventsToCsvRows = (events, names = {}) =>
  events.map((e) => [
    e.seq,
    new Date(e.at).toISOString(),
    e.actor?.name ?? "",
    e.actor?.role ?? "",
    EVENT_LABEL(e.type),
    describeEvent(e, names),
    names.tests?.[e.testId] ?? "",
    names.users?.[e.studentId] ?? "",
    e.hash ?? "",
  ]);
