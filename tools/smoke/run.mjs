import { createRequire } from "node:module";
const require = createRequire(process.env.PLAYWRIGHT || "/home/claude/.npm-global/lib/node_modules/playwright/");
const { chromium } = require("playwright");
import fs from "node:fs";

const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: Number(process.env.W ?? 1280), height: Number(process.env.H ?? 800) } });
const page = await ctx.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push("pageerror: " + e.message));
await page.route("http://smoke.local/**", (r) => r.fulfill({ contentType: "text/html", body: "<!doctype html><html><body></body></html>" }));
await page.goto("http://smoke.local/");
await page.addScriptTag({ content: fs.readFileSync(process.env.BUNDLE || "bundle.js", "utf8") }).catch((e) => console.log("script tag:", e.message.slice(0, 300)));
if (pageErrors.length) { console.log("BOOT ERRORS:", pageErrors); }

const wait = (ms) => page.waitForTimeout(ms);
const results = [];
const visit = async (role, path, { settle = 1600, fresh = true, after } = {}) => {
  pageErrors.length = 0;
  await page.evaluate(([r, p, f]) => window.__mount(r, p, { fresh: f }), [role, path, fresh]);
  await wait(settle);
  if (after) { await after(); await wait(600); }
  const errs = await page.evaluate(() => window.__errors.slice());
  const crashed = await page.evaluate(() => window.__crashed());
  const text = await page.evaluate(() => window.__text());
  const bad = [...errs, ...pageErrors];
  const flags = [];
  if (crashed) flags.push("CRASH");
  if (bad.length) flags.push(`${bad.length} error(s)`);
  if (text.trim().length < 40) flags.push("EMPTY");
  if (/no route for|Something went wrong|Unexpected Application Error/i.test(text)) flags.push("ERROR-TEXT");
  if (/not found|doesn.t exist|no longer exists/i.test(text) && /\/[^/]*\d[^/]*$/.test(path)) flags.push("NOT-FOUND (stale id?)");
  results.push({ role, path, flags, errs: bad.slice(0, 3), len: text.trim().length });
  console.log(`${flags.length ? "FAIL" : "ok  "} ${role.padEnd(7)} ${path}${flags.length ? "  <- " + flags.join(", ") : ""}`);
  bad.slice(0, 2).forEach((e) => console.log("      " + e.split("\n").slice(0, 3).join(" | ").slice(0, 300)));
};

const ROLES = (process.env.ROLES || "admin,teacher,student").split(",");
if (ROLES.includes("admin")) {
await visit("admin", "/admin");
const classId = await page.evaluate(async () => (await window.__get("/classes"))[0].id);
for (const p of ["/admin/users", "/admin/classes", "/admin/profile", "/admin/institution", "/admin/audit", "/admin/audit/tests", "/admin/audit/teachers", "/admin/audit/events"]) await visit("admin", p, { fresh: false });
await visit("admin", `/admin/classes/${classId}`, { fresh: false });
}
if (ROLES.includes("teacher")) {

// teacher
await visit("teacher", "/teacher");
const t = await page.evaluate(async () => {
  const tests = await window.__get("/tests");
  const cls = await window.__get("/analytics/class?classId=cls-11a&subjectId=sub-phys-11a");
  return { draft: tests.find((x) => x.status === "draft")?.id, pub: tests.find((x) => x.status !== "draft")?.id, student: cls.students[0].id };
});
const tPaths = ["/teacher/materials", "/teacher/clusters", "/teacher/bank", "/teacher/drafts", "/teacher/drafts/new", "/teacher/subjects",
  `/teacher/drafts/${t.draft}`, "/teacher/live", `/teacher/results/${t.pub}`, "/teacher/review", "/teacher/analytics",
  `/teacher/analytics/${t.student}`, "/teacher/lms", "/teacher/chat", "/teacher/audit", "/teacher/profile", `/teacher/preview/${t.pub}`];
for (const p of tPaths) await visit("teacher", p, { fresh: false }); // same seeded data as when the ids were read
}
if (ROLES.includes("student")) {
await visit("student", "/student");
const s = await page.evaluate(async () => {
  const tests = await window.__get("/tests");
  let attempt = null;
  try { const a = await window.__get("/attempts"); attempt = a[0]?.id ?? null; } catch {}
  return { live: tests.find((x) => x.status === "live")?.id, attempt };
});
const sPaths = ["/student/tests", "/student/history", ...(s.attempt ? [`/student/history/${s.attempt}`] : []), "/student/lms", "/student/chat", "/student/analytics", "/student/profile", ...(s.live ? [`/take/${s.live}`] : [])];
for (const p of sPaths) await visit("student", p, { fresh: false });
}

const failed = results.filter((r) => r.flags.length);
console.log(`\n${results.length} pages, ${failed.length} with problems`);
await browser.close();
process.exit(failed.length ? 1 : 0);
