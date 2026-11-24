// Pure rules for the admin screens (U1-admin, vellum-64). No React, no fetching: the pages pass
// in what the API returned. Ported to the server only if an endpoint ever needs them.

// ── Accounts list: filters kept in the URL (?q=&role=&show=&class=) ──
export const ACCOUNT_SHOWS = [
  { id: "", label: "Everyone" },
  { id: "inactive", label: "Inactive" },
  { id: "password", label: "Temporary password" },
  { id: "no-class", label: "No class" },
  { id: "no-contact", label: "No parent contact" },
];

const norm = (s) => String(s ?? "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");

/** Does one account pass one "show" filter? */
export const accountShows = (u, show) => {
  switch (show) {
    case "inactive":
      return !u.active;
    case "password":
      return !!u.mustChangePassword;
    case "no-class":
      return u.role === "student" ? !u.classId : !(u.classIds ?? []).length;
    case "no-contact":
      return u.role === "student" && u.hasParentContact === false;
    default:
      return true;
  }
};

/**
 * filters = { q, role: ""|"teacher"|"student", show, classId }.
 * Search matches name, email and roll number, ignoring case and accents ("Tomas" finds "Tomás").
 */
export const filterAccounts = (users, { q = "", role = "", show = "", classId = "" } = {}) => {
  const needle = norm(q.trim());
  return users.filter(
    (u) =>
      (!role || u.role === role) &&
      accountShows(u, show) &&
      (!classId || u.classId === classId || (u.classIds ?? []).includes(classId)) &&
      (!needle || [u.name, u.email, u.roll].some((f) => norm(f).includes(needle))),
  );
};

/** Counts for the filter chips (over the role-filtered list, so the numbers match what a click shows). */
export const accountCounts = (users, role = "") => {
  const base = role ? users.filter((u) => u.role === role) : users;
  return Object.fromEntries(ACCOUNT_SHOWS.map((s) => [s.id || "all", base.filter((u) => accountShows(u, s.id)).length]));
};

// ── Admin home: what needs the administrator, most urgent first ──
// Each item: { id, tone: "danger"|"attention"|"info", title, detail, count?, to, cta }.
// Inputs may be missing while they load; missing input = no item (never a false alarm).
export const buildAttention = ({ users, classes, privacy, integrity, auditTeachers } = {}) => {
  const items = [];
  const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  if (integrity && integrity.ok === false) {
    items.push({ id: "integrity", tone: "danger", title: "The audit record has been altered", detail: `Event #${integrity.badSeq} does not verify. Everything after it is in doubt.`, to: "/admin/audit", cta: "Open audit" });
  }
  if (auditTeachers) {
    const high = auditTeachers.reduce((n, t) => n + (t.signals?.high ?? 0), 0);
    const who = auditTeachers.filter((t) => (t.signals?.high ?? 0) > 0);
    const to = who.length === 1 && who[0].teacherId ? `/admin/audit/teachers/${who[0].teacherId}` : "/admin/audit/teachers";
    if (high) items.push({ id: "signals", tone: "attention", title: `${plural(high, "high audit signal")} to look at`, detail: `${who.map((t) => t.name).join(", ")}. Signals are clues, not proof.`, count: high, to, cta: "Review" });
  }
  if (privacy && privacy.reviewed === false) {
    items.push({ id: "privacy", tone: "attention", title: "The privacy policy is still a draft", detail: "Have your legal adviser review it, then mark it reviewed.", to: "/admin/institution#privacy", cta: "Open policy" });
  }
  if (classes) {
    const empty = classes.filter((c) => !(c.teachers ?? []).length);
    if (empty.length) items.push({ id: "class-teacher", tone: "attention", title: `${plural(empty.length, "class", "classes")} without a teacher`, detail: empty.map((c) => c.name).join(", "), count: empty.length, to: "/admin/classes", cta: "Assign" });
  }
  if (users) {
    const students = users.filter((u) => u.role === "student");
    const noClass = students.filter((u) => !u.classId).length;
    if (noClass) items.push({ id: "no-class", tone: "attention", title: `${plural(noClass, "student")} without a class`, detail: "They can sign in but see no tests.", count: noClass, to: "/admin/users?role=student&show=no-class", cta: "Show" });
    const pending = users.filter((u) => u.mustChangePassword && u.active).length;
    if (pending) items.push({ id: "password", tone: "info", title: `${plural(pending, "account")} still on a temporary password`, detail: "They choose their own at first sign-in. Hand the temporary one over in person.", count: pending, to: "/admin/users?show=password", cta: "Show" });
    const noContact = students.filter((u) => u.hasParentContact === false).length;
    if (noContact) items.push({ id: "no-contact", tone: "info", title: `${plural(noContact, "student")} without a parent contact`, detail: "Teachers need a WhatsApp number to share reports.", count: noContact, to: "/admin/users?role=student&show=no-contact", cta: "Show" });
    const inactive = users.filter((u) => !u.active).length;
    if (inactive) items.push({ id: "inactive", tone: "info", title: `${plural(inactive, "inactive account")}`, detail: "Paused accounts cannot sign in.", count: inactive, to: "/admin/users?show=inactive", cta: "Show" });
  }
  const rank = { danger: 0, attention: 1, info: 2 };
  return items.sort((a, b) => rank[a.tone] - rank[b.tone]);
};

// ── Audit events: bulk approvals shown as one row ──
// Consecutive events of the same type, by the same person, all marked bulk, become one group.
// Groups keep the original events (newest first) so the row can expand.
export const groupEvents = (events) => {
  const out = [];
  for (const e of events) {
    const last = out[out.length - 1];
    const bulk = !!e.meta?.bulk;
    if (bulk && last?.bulk && last.type === e.type && (last.actor?.id ?? last.actor?.name) === (e.actor?.id ?? e.actor?.name)) {
      last.events.push(e);
      continue;
    }
    out.push({ key: `g${e.seq}`, type: e.type, actor: e.actor, bulk, events: [e] });
  }
  return out;
};

/** Local calendar day of an ISO time, e.g. "2026-11-20" (for day headers). */
export const dayKey = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
