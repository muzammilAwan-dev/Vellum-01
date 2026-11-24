// Class discussion rules (F9b), shared by the forms (client) and the mock
// server now; ported unchanged to `server/src/domain/discussion.js` later.

export const THREAD_TAGS = ["Question", "Discussion", "Resource", "Announcement"];
export const TITLE_MAX = 140;
export const BODY_MAX = 5000;
export const REPLY_MAX = 3000;

/** Tags a person may post under: only teachers can make announcements. */
export const tagsFor = (role) => (role === "teacher" ? THREAD_TAGS : THREAD_TAGS.filter((t) => t !== "Announcement"));

/** → an error message, or null when the thread is fine to post. */
export const validateThread = ({ title, body, tag } = {}, role) => {
  const t = String(title ?? "").trim();
  const b = String(body ?? "").trim();
  if (!tagsFor(role).includes(tag)) return tag === "Announcement" ? "Only teachers can post announcements" : "Pick a category";
  if (!t) return "Add a title";
  if (t.length > TITLE_MAX) return `Title is too long (${TITLE_MAX} characters at most)`;
  if (!b) return "Add some detail in the body";
  if (b.length > BODY_MAX) return `Body is too long (${BODY_MAX} characters at most)`;
  return null;
};

export const validateReply = (body) => {
  const b = String(body ?? "").trim();
  if (!b) return "Write a reply first";
  if (b.length > REPLY_MAX) return `Reply is too long (${REPLY_MAX} characters at most)`;
  return null;
};

/** A thread can be marked resolved by any teacher or by the person who started it. */
export const canResolve = (role, userId, thread) => role === "teacher" || thread.authorId === userId;

/** "Just now", "12 min ago", "3 hours ago", "yesterday", "4 days ago", then "Oct 12". */
export const timeAgo = (ts, now = Date.now()) => {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 45) return "Just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} ${h === 1 ? "hour" : "hours"} ago`;
  const d = Math.round(h / 24);
  if (d === 1) return "yesterday";
  if (d < 7) return `${d} days ago`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

/** Pinned first, then most recent activity. */
export const sortThreads = (threads) =>
  [...threads].sort((a, b) => (a.pinned === b.pinned ? b.lastActivityAt - a.lastActivityAt : a.pinned ? -1 : 1));
