// U1 extras for one role (vellum-66): full-length shots + open states (dialogs, menus, errors) + axe on each state.
//   CHROME=... node tools/audit/extras-teacher.mjs        (dev server on :5199 must be running, or BASE_URL)
// Output: tools/audit/live/teacher-extra/{full,state}/*.jpg, extras.json
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const pw = require("playwright");
const axeSource = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

const BASE = process.env.BASE_URL ?? "http://localhost:5199";
const OUT = path.resolve("tools/audit/live/teacher-extra");
const WIDTHS = (process.env.WIDTHS ?? "390,1024,1280").split(",").map(Number);
const THEMES = (process.env.THEMES ?? "light,dark").split(",");
const PART = process.env.PART ?? "full,state";
for (const d of ["full", "state"]) fs.mkdirSync(path.join(OUT, d), { recursive: true });

const browser = await pw.chromium.launch({ headless: true, ...(process.env.CHROME ? { executablePath: process.env.CHROME, args: ["--no-sandbox"] } : {}) });
const shot = (page, file, full = false) => page.screenshot({ path: file, type: "jpeg", quality: 80, fullPage: full });
const axe = async (page, include) => {
  await page.evaluate(axeSource);
  return page.evaluate(async (inc) => {
    const r = await window.axe.run(inc ? { include: [inc] } : document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] }, resultTypes: ["violations"] });
    return r.violations.map((v) => `${v.impact} ${v.id} ×${v.nodes.length} (${v.nodes[0]?.target.join(" ").slice(0, 90)})`);
  }, include);
};
const signIn = async (page) => {
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^teacher/i }).first().click();
  await page.fill("#email", "r.chen@westfield.edu");
  await page.fill("#password", "demo-password-1");
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 }), page.locator("form button[type=submit]").click()]);
  await page.waitForLoadState("networkidle");
};
const ids = (page) => page.evaluate(async () => {
  const get = async (p) => { try { const r = await fetch("/api" + p, { headers: { Authorization: "Bearer " + localStorage.getItem("authToken") } }); return r.ok ? await r.json() : null; } catch { return null; } };
  const tests = (await get("/tests")) ?? [];
  const cls = await get("/analytics/class?classId=cls-11a&subjectId=sub-phys-11a");
  const id = (x) => x?._id ?? x?.id ?? x?.studentId;
  return {
    draft: id(tests.find((t) => t.status === "draft")),
    pub: id(tests.find((t) => t.status !== "draft")),
    completed: id(tests.find((t) => t.status === "completed")),
    live: id(tests.find((t) => t.status === "live")),
    student: id(cls?.students?.[0]),
    statuses: tests.map((t) => `${t.status}:${t.title}`),
  };
});

const PAGES = (i) => ["/teacher", "/teacher/materials", "/teacher/clusters", "/teacher/bank", "/teacher/drafts", "/teacher/drafts/new", "/teacher/subjects", `/teacher/drafts/${i.draft}`, `/teacher/drafts/${i.pub}`, "/teacher/live", `/teacher/results/${i.pub}`, ...(i.completed && i.completed !== i.pub ? [`/teacher/results/${i.completed}`] : []), "/teacher/review", "/teacher/analytics", `/teacher/analytics/${i.student}`, `/teacher/analytics/${i.student}/report`, "/teacher/analytics/share", "/teacher/lms", "/teacher/chat", "/teacher/audit", "/teacher/profile", `/teacher/preview/${i.pub}`];
const slug = (p) => p.replace(/^\/|\/$/g, "").replace(/[/:]/g, "-");

// Open states: [name, path, steps(page)] — each step list returns the locator of the opened thing (for axe) or null.
const click = async (page, re, role = "button") => { const l = page.getByRole(role, { name: re }).filter({ visible: true }).first(); await l.scrollIntoViewIfNeeded({ timeout: 3000 }); await l.click({ timeout: 3000 }); await page.waitForTimeout(500); };
const STATES = (i) => [
  ["nav-drawer", "/teacher", async (p, w) => { if (w >= 860) return "skip"; await p.locator('button[aria-label="Open navigation menu"]').filter({ visible: true }).first().click({ timeout: 3000 }); await p.waitForTimeout(500); return null; }],
  ["palette", "/teacher", async (p) => { await p.keyboard.press("Control+k"); await p.waitForTimeout(400); return "[role=dialog]"; }],
  ["publish", `/teacher/drafts/${i.draft}`, async (p) => { await click(p, /^publish/i); return "[role=dialog]"; }],
  ["swap-question", `/teacher/drafts/${i.draft}`, async (p) => { await click(p, /swap/i); return "[role=dialog]"; }],
  ["bank-add", "/teacher/bank", async (p) => { await click(p, /add a question/i); return "[role=dialog]"; }],
  ["bank-add-empty-save", "/teacher/bank", async (p) => { await click(p, /add a question/i); return "[role=dialog]"; }],
  ["course-new", "/teacher/lms", async (p) => { await click(p, /new course/i); return "[role=dialog]"; }],
  ["chat-new", "/teacher/chat", async (p) => { await click(p, /new (post|thread|discussion)|start/i); return "[role=dialog]"; }],
  ["share-student", `/teacher/analytics/${i.student}`, async (p) => { await click(p, /whatsapp|share|send/i); return "[role=dialog]"; }],
  ["parent-contact", `/teacher/analytics/${i.student}`, async (p) => { await click(p, /^add contact/i); return "[role=dialog]"; }],
  ["materials-review", "/teacher/materials", async (p) => { await click(p, /paste text instead/i); return null; }],
  ["clusters-split", "/teacher/clusters", async (p) => { await click(p, /upload past papers/i); return null; }],
  ["newtest-submit-empty", "/teacher/drafts/new", async (p) => { await click(p, /generate|create/i); return null; }],
  ["review-by-student", "/teacher/review", async (p) => { await click(p, /^by student$/i); return null; }],
  ["review-manual", "/teacher/review", async (p) => { await click(p, /^manual queue$/i); return null; }],
  ["live-stop-confirm", "/teacher/live", async (p) => { await click(p, /stop test for everyone/i); return "[role=dialog],[role=alertdialog]"; }],
  ["share-queue-student", `/teacher/analytics/${i.student}`, async (p) => { await click(p, /^share report/i); return "[role=dialog]"; }],
  ["subjects-add", "/teacher/subjects", async (p) => { await p.getByLabel("New subject name").fill("Biology"); await p.waitForTimeout(200); return null; }],
  ["profile-password", "/teacher/profile", async (p) => { const f = p.locator('input[type=password]'); await f.nth(0).fill("demo-password-1"); await f.nth(1).fill("short"); await p.waitForTimeout(200); await f.nth(1).scrollIntoViewIfNeeded(); return null; }],
  ["home-today", "/teacher", async () => null],
  ["review-open-first", "/teacher/review", async (p) => { await p.locator("main button[aria-expanded]").first().click({ timeout: 3000 }); await p.waitForTimeout(500); return null; }],
  ["review-by-question", "/teacher/review", async (p) => { await p.getByRole("radio", { name: "By question" }).click({ timeout: 3000 }); await p.waitForTimeout(400); return null; }],
  ["analytics-at-risk", "/teacher/analytics?show=at-risk", async () => null],
  ["drafts-menu", "/teacher/drafts", async (p) => { const b = p.locator("main [aria-haspopup=menu]").first(); await b.click({ timeout: 3000 }); await p.waitForTimeout(400); return "[role=menu]"; }],
];

const out = { ids: null, full: [], states: [] };
for (const w of WIDTHS) for (const theme of THEMES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w < 520 ? 844 : w < 1100 ? 768 : 800 }, deviceScaleFactor: 1, hasTouch: w < 860, isMobile: w < 520, reducedMotion: "reduce" });
  await ctx.addInitScript((t) => { try { localStorage.setItem("vellum.theme", JSON.stringify(t)); } catch { /* */ } }, theme);
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(e.message));
  await signIn(page);
  const i = await ids(page); out.ids ??= i;
  if (PART.includes("full")) for (const p of PAGES(i)) {
    await page.goto(BASE + p, { waitUntil: "networkidle" }); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(700);
    await shot(page, path.join(OUT, "full", `${slug(p)}__${w}__${theme}.jpg`), true);
    out.full.push({ p, w, theme, h: await page.evaluate(() => document.documentElement.scrollHeight) });
  }
  if (PART.includes("state")) for (const [name, p, run] of STATES(i)) {
    try {
      await page.goto(BASE + p, { waitUntil: "networkidle" }); await page.waitForTimeout(600);
      const sel = await run(page, w);
      if (sel === "skip") continue;
      if (name === "bank-add-empty-save") { const s = page.locator("[role=dialog] button").filter({ hasText: /save|add/i }).last(); await s.click({ timeout: 2000, force: true }).catch(() => {}); await page.waitForTimeout(300); }
      await shot(page, path.join(OUT, "state", `${name}__${w}__${theme}.jpg`), !sel);
      const row = { name, w, theme, opened: sel ? await page.locator(sel).count() : null };
      if (theme === "light" && w === 1280 || w === 390 && theme === "light") {
        row.axe = await axe(page, sel && row.opened ? sel : null);
        if (sel === "[role=dialog]" && row.opened) { await page.keyboard.press("Escape"); await page.waitForTimeout(300); row.escapeCloses = (await page.locator(sel).count()) === 0; }
      }
      out.states.push(row);
    } catch (e) { out.states.push({ name, w, theme, error: e.message.split("\n")[0].slice(0, 140) }); }
  }
  out.errors = [...(out.errors ?? []), ...errs.map((e) => `${w}${theme}: ${e}`)];
  await ctx.close();
  console.log("done", w, theme);
}
fs.writeFileSync(path.join(OUT, "extras.json"), JSON.stringify(out, null, 1));
await browser.close();
