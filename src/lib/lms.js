// Courses & lessons (F9a). Pure rules shared by the lesson form (client) and the
// mock server now, ported unchanged to `server/src/domain/lms.js` later.

export const LESSON_KINDS = ["text", "video", "file"];
export const TITLE_MAX = 140;
export const BODY_MAX = 20_000;

/** Only web links: lesson URLs end up in `href`/`src`, so `javascript:` etc. must never get through. */
export const isHttpUrl = (s) => {
  try {
    const u = new URL(String(s).trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
};

/** → an error message for the teacher, or null when the lesson is fine. */
export const validateLesson = ({ kind, title, url, body } = {}) => {
  if (!LESSON_KINDS.includes(kind)) return "Pick a lesson type";
  const t = String(title ?? "").trim();
  if (!t) return "Title is required";
  if (t.length > TITLE_MAX) return `Title is too long (${TITLE_MAX} characters at most)`;
  if (kind === "video" || kind === "file") {
    if (!String(url ?? "").trim()) return kind === "video" ? "Video URL is required" : "File URL is required";
    if (!isHttpUrl(url)) return "The link must start with http:// or https://";
  }
  if (kind === "text" && !String(body ?? "").trim()) return "Lesson content is required";
  if (String(body ?? "").length > BODY_MAX) return "Content is too long";
  return null;
};

/** { done, total, percent } for a list of lessons and a predicate saying which are done. */
export const courseProgress = (lessons, isDone) => {
  const total = lessons.length;
  const done = lessons.filter(isDone).length;
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0 };
};

/** Move `id` one place up/down in `ids` (a new array; unchanged at the ends or if unknown). */
export const moveId = (ids, id, direction) => {
  const i = ids.indexOf(id);
  const j = i + (direction === "up" ? -1 : 1);
  if (i < 0 || j < 0 || j >= ids.length) return [...ids];
  const next = [...ids];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
};

/** True when `ids` is exactly the same set as `current` (a pure reordering). */
export const isPermutation = (ids, current) =>
  Array.isArray(ids) && ids.length === current.length && new Set(ids).size === ids.length && ids.every((id) => current.includes(id));

/** First lesson not yet done, in course order. */
export const nextLesson = (lessons) => lessons.find((l) => !l.done) ?? null;
