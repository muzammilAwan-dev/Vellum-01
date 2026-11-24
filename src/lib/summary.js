import { REPORT_LABELS } from "./reportLabels";
import { fitsWhatsApp } from "./contact";

// ═══════════════════════════════════════════════════════════════
// PARENT SUMMARY TEXT (F12c2) — the short WhatsApp message that goes with (or instead of) the PDF.
// Pure: the share dialog (F12d), the Profile preview and the real server (B14) all use it.
// It is built only from a report made by lib/report.js buildReport: confirmed marks, the student's own
// name and class, topics, the teacher's own comment. Never flags, other students' names or marks
// (class averages only), the parent's number, or question text.
// Style (sections, language, greeting, sign-off, emoji, length) is saved per teacher in
// prefs.parentSummary through PATCH /profile.
// ═══════════════════════════════════════════════════════════════
export const SUMMARY_SECTIONS = [
  { id: "result", label: "Result (average or test score)" },
  { id: "trend", label: "Trend" },
  { id: "strong", label: "Strong topics" },
  { id: "weak", label: "Topics that need work" },
  { id: "comment", label: "Your comment" },
];
export const SUMMARY_LANGS = ["en", "ur", "both"];
export const SUMMARY_LENGTHS = ["short", "standard"];
export const SHORT_MAX = 600; // characters of text (the link budget in lib/contact.js still applies)
export const STANDARD_MAX = 1200;
export const GREETING_MAX = 60;
export const SIGNOFF_MAX = 60;

export const DEFAULT_SUMMARY_PREFS = {
  sections: ["result", "trend", "weak", "comment"],
  language: "en",
  greeting: "", // "" = the language's usual greeting
  signoff: "", // "" = the language's usual closing; the teacher's name is added under it
  emoji: false,
  length: "short",
};

// Urdu wording below is standard school-report language kept free of gendered verbs, but it MUST be
// checked by an Urdu-speaking teacher before use (plan decision 14). Shared words come from REPORT_LABELS.
const R = (key) => REPORT_LABELS[key];
export const SUMMARY_LABELS = {
  en: {
    greeting: "Assalam o Alaikum",
    signoff: "Regards",
    average: R("average")[0],
    classAverage: R("classAverage")[0],
    score: R("score")[0],
    tests: R("tests")[0].toLowerCase(),
    trend: { up: R("up")[0], down: R("down")[0], steady: R("steady")[0] },
    strong: "Strong topics",
    weak: "Needs more work",
    comment: R("teacherComment")[0],
    noMarks: R("noMarks")[0],
    trendWord: R("trend")[0],
  },
  ur: {
    greeting: "السلام علیکم",
    signoff: "والسلام",
    average: R("average")[1],
    classAverage: R("classAverage")[1],
    score: R("score")[1],
    tests: R("tests")[1],
    trend: { up: R("up")[1], down: R("down")[1], steady: R("steady")[1] },
    strong: "مضبوط موضوعات",
    weak: R("weakTopics")[1].replace(/\s*\(.*\)$/, ""), // "مزید محنت درکار"
    comment: R("teacherComment")[1],
    noMarks: R("noMarks")[1],
    trendWord: R("trend")[1],
  },
};

// eslint-disable-next-line no-control-regex -- stripping control characters is the point
const CTRL = /[\u0000-\u001f\u007f]/g;
const tidy = (s, max) => String(s ?? "").replace(CTRL, " ").replace(/\s+/g, " ").trim().slice(0, max);

/** Any input → a complete, valid style object (unknown or bad values fall back to the defaults). */
export const normalizeSummaryPrefs = (input) => {
  const p = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const known = SUMMARY_SECTIONS.map((s) => s.id);
  const sections = Array.isArray(p.sections) ? known.filter((id) => p.sections.includes(id)) : DEFAULT_SUMMARY_PREFS.sections;
  return {
    sections,
    language: SUMMARY_LANGS.includes(p.language) ? p.language : DEFAULT_SUMMARY_PREFS.language,
    greeting: tidy(p.greeting, GREETING_MAX),
    signoff: tidy(p.signoff, SIGNOFF_MAX),
    emoji: p.emoji === true,
    length: SUMMARY_LENGTHS.includes(p.length) ? p.length : DEFAULT_SUMMARY_PREFS.length,
  };
};

/** Strict check of what a client sends (the server uses it for PATCH /profile). Returns `{ field: message }` or null. */
export const validateSummaryPrefs = (input) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { _: "Parent message style must be an object" };
  const errors = {};
  const allowed = Object.keys(DEFAULT_SUMMARY_PREFS);
  const unknown = Object.keys(input).filter((k) => !allowed.includes(k));
  if (unknown.length) errors._ = `Unknown parent message setting: ${unknown.join(", ")}`;
  const known = SUMMARY_SECTIONS.map((s) => s.id);
  if ("sections" in input && (!Array.isArray(input.sections) || input.sections.some((s) => !known.includes(s)) || new Set(input.sections).size !== input.sections.length)) errors.sections = "Choose from the listed sections";
  if ("language" in input && !SUMMARY_LANGS.includes(input.language)) errors.language = "Choose English, Urdu or both";
  if ("length" in input && !SUMMARY_LENGTHS.includes(input.length)) errors.length = "Choose short or standard";
  if ("emoji" in input && typeof input.emoji !== "boolean") errors.emoji = "Emoji is on or off";
  for (const [k, max] of [["greeting", GREETING_MAX], ["signoff", SIGNOFF_MAX]]) {
    if (k in input && (typeof input[k] !== "string" || input[k].length > max)) errors[k] = `Keep it under ${max} characters`;
  }
  return Object.keys(errors).length ? errors : null;
};

// WhatsApp formatting: *bold*, _italic_. The characters are removed from names and comments so they cannot break the layout.
const plain = (s) => String(s ?? "").replace(/[*_~`]/g, "").trim();
const ICON = { result: "📊", trend: "📈", strong: "✅", weak: "📌", comment: "💬" };

const cut = (text, max) => {
  const t = plain(text).replace(/\s+/g, " ");
  if (max <= 0) return "";
  if (t.length <= max) return t;
  const head = t.slice(0, max - 1);
  const space = head.lastIndexOf(" ");
  return `${(space > max * 0.6 ? head.slice(0, space) : head).replace(/[\s,;:.]+$/, "")}…`;
};

const topicList = (list, n) => list.slice(0, n).map((t) => `${plain(t.name)} ${Math.round(t.accuracy)}%`).join(", ");

/** The lines of one language: result, trend, topics, comment. `plan` says how much room there is. */
const bodyLines = (report, lang, prefs, plan, withHeader) => {
  // withHeader = first language block: it also carries the name line and the (single) comment
  const L = SUMMARY_LABELS[lang];
  const on = (id) => prefs.sections.includes(id);
  const icon = (id) => (prefs.emoji ? `${ICON[id]} ` : "");
  const lines = [];
  const h = report.header;
  if (withHeader) {
    lines.push([`*${plain(h.student.name)}*`, h.classCode, h.subject && plain(h.subject), h.period?.label].filter(Boolean).join(" · "));
  }
  if (report.empty) {
    lines.push(L.noMarks);
    return lines;
  }
  const test = report.kind === "test" ? report.tests[0] : null;
  if (on("result")) {
    if (test) {
      const classAvg = plan.classAvg && test.classAverage != null ? ` · ${L.classAverage}: ${Math.round(test.classAverage)}%` : "";
      lines.push(`${icon("result")}${L.score}: ${test.marks}/${test.max} (${Math.round(test.percent)}%)${classAvg}`);
    } else if (report.summary && report.summary.average != null) {
      const s = report.summary;
      const classAvg = plan.classAvg && s.classAverage != null ? ` · ${L.classAverage}: ${s.classAverage}%` : "";
      lines.push(`${icon("result")}${L.average}: ${s.average}% (${s.tests} ${L.tests})${classAvg}`);
    }
  }
  if (on("trend") && !test && report.summary?.trend) lines.push(`${icon("trend")}${L.trendWord}: ${L.trend[report.summary.trend]}`);
  if (plan.topics > 0 && report.topics) {
    if (on("strong") && report.topics.strong.length) lines.push(`${icon("strong")}${L.strong}: ${topicList(report.topics.strong, plan.topics)}`);
    if (on("weak") && report.topics.weak.length) lines.push(`${icon("weak")}${L.weak}: ${topicList(report.topics.weak, plan.topics)}`);
  }
  const comment = withHeader && on("comment") && plan.comment > 0 ? cut(report.comment, plan.comment) : "";
  if (comment) lines.push(`${icon("comment")}_${L.comment}:_ ${comment}`);
  return lines;
};

/**
 * `report` = a lib/report.js report (build it with every section on so the style decides what is sent).
 * `ctx` = { parentName?, teacherName? }. Returns `{ text, level, fits }`:
 *  level 0 = as styled; 1 and up = the message had to be trimmed (shorter comment, fewer topics, result only)
 *  so that it stays within the length setting AND fits one wa.me link (an Urdu letter costs 6 characters of it).
 * Nothing is added that is not in the report; the numbers are never rounded up.
 */
export const buildSummaryText = (report, prefsIn, ctx = {}) => {
  const prefs = normalizeSummaryPrefs(prefsIn);
  const short = prefs.length === "short";
  const cap = short ? SHORT_MAX : STANDARD_MAX;
  const plans = [
    { topics: short ? 1 : 3, comment: short ? 160 : 400, classAvg: !short, frame: true },
    { topics: 1, comment: 100, classAvg: false, frame: true },
    { topics: 1, comment: 0, classAvg: false, frame: true },
    { topics: 0, comment: 0, classAvg: false, frame: false },
  ];
  const render = (plan) => {
    const langs = prefs.language === "both" ? ["en", "ur"] : [prefs.language];
    const first = langs[0];
    const out = [];
    if (plan.frame) {
      const greet = prefs.greeting || SUMMARY_LABELS[first].greeting;
      out.push(`${greet}${ctx.parentName ? ` ${plain(ctx.parentName)}` : ""},`);
    }
    langs.forEach((lang, i) => {
      if (i > 0) out.push("");
      out.push(...bodyLines(report, lang, prefs, plan, i === 0));
    });
    if (plan.frame) {
      out.push("");
      out.push(prefs.signoff || SUMMARY_LABELS[first].signoff);
      if (ctx.teacherName) out.push(plain(ctx.teacherName));
    }
    return out.join("\n").trim();
  };
  let text = "";
  for (let level = 0; level < plans.length; level++) {
    text = render(plans[level]);
    if (text.length <= cap && fitsWhatsApp(text)) return { text, level, fits: true };
  }
  return { text, level: plans.length - 1, fits: fitsWhatsApp(text) };
};
