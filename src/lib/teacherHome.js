// Pure rules for the teacher home ("Today", U1-teacher, vellum-66). No React, no fetching: the page
// passes in what the API returned. Like lib/adminHome.js: what needs the teacher, most urgent first.

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const DAY = 86_400_000;

/** "Tue 25 Nov, 09:00" style, in the browser's zone (dates come in as ms or ISO). */
const when = (t) =>
  new Date(t).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * Build the "Today" list.
 * inputs: { tests, queue, analytics, now }
 *   tests     — rows from GET /tests (status, title, id, schedule, updatedAt, questionCount)
 *   queue     — rows from GET /grading/queue (status, confidence, manual)
 *   analytics — GET /analytics/class for the active class + subject ({ summary, students })
 * Each item: { id, tone: "danger"|"attention"|"live"|"info", title, detail, to, cta }.
 * Missing input = no item for it (never a false alarm while something loads).
 */
export const buildTeacherToday = ({ tests, queue, analytics, now = Date.now() } = {}) => {
  const items = [];

  // 1. A test running right now: watch it.
  for (const t of (tests ?? []).filter((x) => x.status === "live")) {
    const closes = t.schedule?.availableUntil ? new Date(t.schedule.availableUntil).getTime() : null;
    items.push({
      id: `live-${t.id}`,
      tone: "live",
      title: `${t.title} is live`,
      detail: closes ? `Closes ${when(closes)}.` : "No end time: it runs until you stop it.",
      to: `/teacher/live?test=${t.id}`,
      cta: "Live control",
    });
  }

  // 2. Marks waiting for the teacher (students see nothing until they are approved).
  if (queue) {
    const open = queue.filter((g) => g.status !== "reviewed");
    const low = open.filter((g) => g.confidence === "low").length;
    const manual = open.filter((g) => g.manual).length;
    if (open.length) {
      items.push({
        id: "review",
        tone: low ? "attention" : "info",
        title: `${plural(open.length, "answer")} to review`,
        detail: [low ? `${low} with low AI confidence: check those first` : "The AI is confident about all of them", manual ? `${manual} need a mark by hand` : null].filter(Boolean).join(" · ") + ".",
        to: "/teacher/review",
        cta: "Grade review",
      });
    }
  }

  // 3. Tests opening soon (next 7 days): check them while they can still change.
  for (const t of (tests ?? []).filter((x) => x.status === "scheduled")) {
    const from = t.schedule?.availableFrom ? new Date(t.schedule.availableFrom).getTime() : null;
    if (from == null || from - now > 7 * DAY) continue;
    items.push({ id: `soon-${t.id}`, tone: "info", title: `${t.title} opens ${when(from)}`, detail: "Still editable until it opens.", to: `/teacher/drafts/${t.id}`, cta: "Check it" });
  }

  // 4. Students under the target: parents can be told.
  const s = analytics?.summary;
  if (s && s.tests > 0 && s.studentsAtRisk > 0) {
    items.push({
      id: "at-risk",
      tone: "attention",
      title: `${plural(s.studentsAtRisk, "student")} under ${s.target ?? 75}%`,
      detail: s.belowTarget?.length ? `Weakest topic: ${s.belowTarget[0]}. Send their parents a report, or aim the next test at it.` : "Send their parents a report.",
      to: "/teacher/analytics?show=at-risk",
      cta: "See who",
    });
  }

  // 5. Unpublished drafts (the newest one): finish or delete.
  const drafts = (tests ?? []).filter((x) => x.status === "draft").sort((a, b) => new Date(b.updatedAt ?? 0) - new Date(a.updatedAt ?? 0));
  if (drafts.length) {
    const d = drafts[0];
    items.push({
      id: "drafts",
      tone: "info",
      title: drafts.length === 1 ? `Draft "${d.title}" isn't published` : `${plural(drafts.length, "draft")} not published`,
      detail: drafts.length === 1 ? "Review it and publish when it's ready." : `Newest: "${d.title}".`,
      to: drafts.length === 1 ? `/teacher/drafts/${d.id}` : "/teacher/drafts",
      cta: drafts.length === 1 ? "Continue" : "See drafts",
    });
  }

  const RANK = { danger: 0, live: 1, attention: 2, info: 3 };
  return items.sort((a, b) => RANK[a.tone] - RANK[b.tone]); // Array.prototype.sort is stable
};

/** Greeting by the hour, and "Dr. R. Chen" → "Dr. Chen" (middle initials dropped). */
export const greetingFor = (hour) => (hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening");
export const shortName = (name = "") => name.split(" ").filter((w) => !/^[A-Z]\.$/.test(w) || w === "Dr.").join(" ");
