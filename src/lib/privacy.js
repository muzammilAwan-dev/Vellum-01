// ═══════════════════════════════════════════════════════════════
// PRIVACY POLICY (F14) — pure; the fake server, the admin editor and the public page share it, the real
// server ports it (B15). The institution, not Vellum, is the data controller: this is a TEMPLATE the
// institution must review with its own legal adviser. It is not legal advice and makes no claim of
// compliance with any law.
// The text is plain text, never HTML: `## ` starts a heading, `- ` a bullet, a blank line ends a paragraph.
// ═══════════════════════════════════════════════════════════════
export const PRIVACY_MIN = 200;
export const PRIVACY_MAX = 20_000;

/** Values a policy may use. `{{name}}` is replaced; `{{#key}}…{{/key}}` is kept only when that value is set. */
export const PRIVACY_PLACEHOLDERS = ["institution", "contactEmail", "city"];
export const PRIVACY_BLOCKS = ["photos", "city", "contactEmail"];

export const PRIVACY_TEMPLATE = `## Who this policy is from
This policy explains how {{institution}}{{#city}} ({{city}}){{/city}} ("we", "the institution") uses Vellum, the online assessment platform, and what happens to the information in it. The institution decides what is collected and why. Vellum is the tool we use.

## What we collect
- Account details: your name, email address, role (student, teacher or administrator), class and roll number.
- Profile details you choose to add, such as a phone number or a short bio.
{{#photos}}- A profile photo, only if you or the administrator add one.
{{/photos}}- Tests and results: the answers you give, your marks, the time you took and the feedback teachers write.
- Parent or guardian details: a teacher or administrator may record a parent's name and mobile number for a student.
- Activity records: sign-ins, password changes and the grading and reporting actions described below.

## Why we use it
- To run tests and show students and teachers their results.
- To help teachers see how a class is doing and which topics need more work.
- To keep marking fair and to be able to explain how a mark was reached.
- To share progress with parents and guardians.
- To keep accounts secure.

## Who can see it
- Students see their own tests, marks and profile.
- Teachers see the students in the classes they teach.
- Administrators manage accounts, classes and the institution's settings, and can review the audit log.
- We do not sell personal information and we do not use it for advertising.

## Tests and anti-cheat signals
While a test is open the app may record events such as leaving the test window. These are signals for a teacher to review. They are not a finding that anyone cheated, and a teacher decides what, if anything, to do about them.

## AI features
Where the institution has turned AI features on, test material and students' written answers may be sent to an AI service provider so that it can suggest marks and help write questions. A suggested mark is a draft: a teacher confirms or changes it before a student sees it. We ask the provider not to use this material to train its models, and we send no more than is needed.

## Marks and the audit log
Grading actions, report creation and sharing, and changes to accounts and settings are written to an audit log that cannot be edited. It records who did what and when, so that marks can be checked. It does not contain the text of messages or parents' phone numbers.

## Parent and guardian contact
A teacher can share a student's report with a parent or guardian. Vellum stores the parent's name and mobile number so that the teacher can do this. Vellum does not send the message: the teacher opens WhatsApp on their own device and sends it from there. Vellum keeps no message text. The audit log notes that a report was opened for sharing, not what it said or the number it went to. WhatsApp is a separate service with its own privacy policy.

## How long we keep it
We keep records for the academic year and for the further period the institution sets, then delete or anonymise them. The audit log is kept for at least one academic year.

## Your rights
You can ask to see the information we hold about you, to have it corrected, or to have it deleted where we are allowed to delete it. Students under 18 can ask through a parent or guardian. Ask the administrator{{#contactEmail}} at {{contactEmail}}{{/contactEmail}}. We will tell you what we can do and, if we cannot do something, why.

## Children
Many students are under 18. The institution is responsible for having a lawful basis, and any consent it needs from parents or guardians, to use Vellum with them. Parents and guardians can ask the institution about anything in this policy.

## Security
Accounts are protected by passwords, and each person sees only what their role allows. No system is completely secure. If we learn that personal information has been exposed, we will tell the people affected as the law and our own rules require.

## Changes to this policy
When this policy changes, its version number and date change with it. We will tell users about important changes in advance.

## Contact
Questions about this policy: ask the administrator of {{institution}}{{#contactEmail}} at {{contactEmail}}{{/contactEmail}}.
`;

/** The values for the placeholders from the institution settings. */
const valuesOf = (institution) => ({
  institution: institution?.name || "our institution",
  contactEmail: institution?.email || "",
  city: institution?.city || "",
  photos: institution?.allowStudentPhotos === true,
});

/** Fill the placeholders and drop the blocks whose value is not set. A line left empty by a dropped block is removed. */
export const renderPolicy = (source, institution) => {
  const v = valuesOf(institution);
  let text = String(source ?? "").replace(/\{\{\s*#(\w+)\s*\}\}([\s\S]*?)\{\{\s*\/\1\s*\}\}/g, (_, key, body) => (v[key] ? body : ""));
  text = text.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, key) => (key in v && typeof v[key] === "string" ? v[key] : m));
  return text.replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim() + "\n";
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const isValidEffectiveDate = (s) => {
  if (typeof s !== "string" || !DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
};

export const PRIVACY_FIELDS = ["text", "effectiveDate", "reviewed"];

/** Why the policy text cannot be saved (one short sentence), or null. Plain text only. */
export const policyTextProblem = (text) => {
  if (typeof text !== "string") return "Enter the policy text";
  const t = text.trim();
  if (t.length < PRIVACY_MIN) return `The policy is too short (at least ${PRIVACY_MIN} characters)`;
  if (t.length > PRIVACY_MAX) return `The policy is too long (at most ${PRIVACY_MAX.toLocaleString("en-US")} characters)`;
  // eslint-disable-next-line no-control-regex -- control characters are exactly what is refused here
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(t)) return "The text has characters that aren't allowed";
  if (/<\s*[a-zA-Z!/?]/.test(t)) return "Use plain text only: no HTML tags";
  const badHeading = t.split("\n").find((l) => /^#/.test(l) && !/^## \S/.test(l));
  if (badHeading) return "Headings must start with \"## \" (two hashes and a space)";
  const tags = [...t.matchAll(/\{\{\s*([#/]?)(\w*)\s*\}\}/g)];
  for (const [, mark, name] of tags) {
    if (mark && !PRIVACY_BLOCKS.includes(name)) return `Unknown block {{${mark}${name}}}`;
    if (!mark && !PRIVACY_PLACEHOLDERS.includes(name)) return `Unknown placeholder {{${name}}}`;
  }
  if (t.replace(/\{\{\s*([#/]?)(\w*)\s*\}\}/g, "").includes("{{")) return "A {{ placeholder }} is not closed";
  const open = {};
  for (const [, mark, name] of tags) {
    if (mark === "#") open[name] = (open[name] ?? 0) + 1;
    if (mark === "/") open[name] = (open[name] ?? 0) - 1;
    if ((open[name] ?? 0) < 0) return `{{/${name}}} has no matching {{#${name}}}`;
  }
  if (Object.values(open).some((n) => n !== 0)) return "A {{#block}} is not closed";
  return null;
};

/** Checks a PUT body (a partial update). Returns `{ field: message }`, or null when valid. */
export const validatePrivacyPatch = (patch) => {
  const errors = {};
  const p = patch && typeof patch === "object" && !Array.isArray(patch) ? patch : null;
  if (!p) return { _: "Send the changes as an object" };
  const keys = Object.keys(p);
  const unknown = keys.filter((k) => !PRIVACY_FIELDS.includes(k));
  if (unknown.length) errors._ = `You can't change ${unknown.join(", ")} here`;
  else if (!keys.length) errors._ = "Nothing to change";
  if ("text" in p) {
    const problem = policyTextProblem(p.text);
    if (problem) errors.text = problem;
  }
  if ("effectiveDate" in p && p.effectiveDate !== "" && p.effectiveDate !== null && !isValidEffectiveDate(p.effectiveDate)) errors.effectiveDate = "Enter a real date (YYYY-MM-DD) or leave it empty";
  if ("reviewed" in p && typeof p.reviewed !== "boolean") errors.reviewed = "Reviewed is on or off";
  return Object.keys(errors).length ? errors : null;
};

/** Which of text / effectiveDate / reviewed differ between two stored policies (names only: safe for the audit log). */
export const privacyChangedFields = (before, after) =>
  PRIVACY_FIELDS.filter((k) => (before?.[k] ?? (k === "reviewed" ? false : "")) !== (after?.[k] ?? (k === "reviewed" ? false : "")) && !(k === "effectiveDate" && !before?.[k] && !after?.[k]));

/** Plain text → blocks for display: [{ type: "h" | "p" | "ul", text? , items? }]. Nothing here is ever HTML. */
export const policyBlocks = (text) => {
  const blocks = [];
  let para = [];
  let list = null;
  const flush = () => {
    if (para.length) blocks.push({ type: "p", text: para.join(" ") });
    if (list) blocks.push({ type: "ul", items: list });
    para = [];
    list = null;
  };
  for (const raw of String(text ?? "").split("\n")) {
    const line = raw.trim();
    if (!line) flush();
    else if (line.startsWith("## ")) {
      flush();
      blocks.push({ type: "h", text: line.slice(3).trim() });
    } else if (line.startsWith("- ")) {
      if (para.length) flush();
      (list ??= []).push(line.slice(2).trim());
    } else {
      if (list) flush();
      para.push(line);
    }
  }
  flush();
  return blocks;
};

/** The saved policy, or the template when nothing is saved yet (version 1). */
export const effectivePolicy = (stored) => ({
  text: stored?.text ?? PRIVACY_TEMPLATE,
  version: stored?.version ?? 1,
  effectiveDate: stored?.effectiveDate || "",
  updatedAt: stored?.updatedAt ?? null,
  reviewed: stored?.reviewed === true,
});

/** What every reader gets: the text with the placeholders filled in. `stored` = the saved policy or null (nothing saved yet → the template). */
export const privacyView = (stored, institution, { admin = false } = {}) => {
  const p = effectivePolicy(stored);
  const view = { text: renderPolicy(p.text, institution), version: p.version, effectiveDate: p.effectiveDate || null, updatedAt: p.updatedAt, reviewed: p.reviewed };
  return admin ? { ...view, source: p.text, isTemplate: !stored } : view;
};
