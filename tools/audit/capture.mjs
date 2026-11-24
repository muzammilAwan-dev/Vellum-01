// UI audit capture: renders every page of ONE role at several widths and both themes in headless Chromium,
// saves screenshots, and runs mechanical checks (overflow, tap targets, tiny text, unnamed controls…).
// It uses the smoke harness bundle (real route table + fake backend) and the compiled stylesheet, so it needs
//   bash tools/smoke/build.sh        → tools/smoke/bundle.js
//   node tools/audit/build-css.mjs   → tools/audit/app.css
// Usage: ROLE=admin|teacher|student|public (public = signed out: login, 404) [WIDTHS=360,390,768,1024,1280,1536] [THEMES=light,dark] node tools/audit/capture.mjs
// Env: PLAYWRIGHT (path to playwright), CHROME (chromium binary), OUT (default tools/audit/shots)
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
const require = createRequire(process.env.PLAYWRIGHT || "/home/claude/.npm-global/lib/node_modules/playwright/");
const { chromium } = require("playwright");

const ROLE = process.env.ROLE ?? "admin";
const WIDTHS = (process.env.WIDTHS ?? "360,390,768,1024,1280,1536").split(",").map(Number);
const THEMES = (process.env.THEMES ?? "light,dark").split(",");
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null; // substrings of paths
const OUT = path.resolve(process.env.OUT ?? "tools/audit/shots", ROLE);
const HEIGHT = { 360: 740, 390: 844, 768: 1024, 1024: 768, 1280: 800, 1536: 864 };
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME || "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome", args: ["--no-sandbox"] });
const css = fs.readFileSync(path.resolve("tools/audit/app.css"), "utf8");
const bundle = fs.readFileSync(path.resolve(process.env.BUNDLE ?? "tools/smoke/bundle.js"), "utf8");

const CHECKS = () => {
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && !el.closest("[aria-hidden='true']"); };
  const name = (el) => (el.getAttribute("aria-label") || el.getAttribute("title") || el.innerText || el.getAttribute("alt") || el.getAttribute("placeholder") || "").trim().replace(/\s+/g, " ").slice(0, 40);
  const sel = (el) => el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "");
  const out = {};
  const vw = window.innerWidth;
  out.hScroll = document.documentElement.scrollWidth > vw + 1;
  out.wide = [...document.querySelectorAll("body *")].filter((e) => vis(e) && e.getBoundingClientRect().right > vw + 2 && !e.closest("[class*='overflow-x'],[class*='overflow-auto'],table")).slice(0, 3).map(sel);
  const inter = [...document.querySelectorAll("a[href],button,input:not([type=hidden]),select,textarea,[role=button],[role=tab],[role=menuitem],[role=switch]")].filter((e) => vis(e) && !e.closest(".sr-only") && !e.classList.contains("sr-only"));
  out.small = inter.filter((e) => { const r = e.getBoundingClientRect(); const inline = e.tagName === "A" && e.closest("p,li") && getComputedStyle(e).display === "inline"; return !inline && (r.width < 24 || r.height < 24); }).slice(0, 40).map((e) => `${sel(e)} "${name(e)}" ${Math.round(e.getBoundingClientRect().width)}×${Math.round(e.getBoundingClientRect().height)}`);
  out.unnamed = inter.filter((e) => !name(e) && !e.getAttribute("aria-labelledby") && !(e.id && document.querySelector(`label[for="${e.id}"]`)) && !e.closest("label")).slice(0, 10).map(sel);
  const tiny = new Set();
  for (const e of document.querySelectorAll("body *")) { if (!vis(e)) continue; const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()); if (own && parseFloat(getComputedStyle(e).fontSize) < 11) tiny.add(`${sel(e)} ${getComputedStyle(e).fontSize} "${(e.innerText || "").trim().slice(0, 24)}"`); }
  out.tinyText = [...tiny].slice(0, 10);
  out.imgNoAlt = [...document.querySelectorAll("img")].filter((i) => !i.hasAttribute("alt")).length;
  const hs = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter(vis).map((h) => Number(h.tagName[1]));
  out.h1 = hs.filter((n) => n === 1).length;
  out.headingJumps = hs.filter((n, i) => i > 0 && n - hs[i - 1] > 1).length;
  const ids = [...document.querySelectorAll("[id]")].map((e) => e.id); out.dupIds = [...new Set(ids.filter((x, i) => ids.indexOf(x) !== i))].slice(0, 5);
  out.lang = document.documentElement.lang || "";
  return out;
};

const scroller = () => {
  let best = null, area = 0;
  for (const e of document.querySelectorAll("*")) {
    const s = getComputedStyle(e);
    if ((s.overflowY === "auto" || s.overflowY === "scroll") && e.scrollHeight > e.clientHeight + 40) { const a = e.clientWidth * e.clientHeight; if (a > area) { area = a; best = e; } }
  }
  if (!best) return null;
  best.setAttribute("data-audit-scroller", "1");
  return { sh: best.scrollHeight, ch: best.clientHeight };
};

const report = [];
const slug = (p) => (p === "/" + ROLE ? "home" : p.replace(/^\/|\/$/g, "").replace(/[\/:]/g, "-"));

for (const w of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: HEIGHT[w] ?? 800 }, deviceScaleFactor: 1, hasTouch: w < 860, isMobile: w < 520 });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.route("http://smoke.local/**", (r) => r.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1.0, interactive-widget=resizes-content"></head><body></body></html>' }));
  await page.goto("http://smoke.local/");
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: bundle });

  const mount = async (p, fresh) => { errs.length = 0; await page.evaluate(([r, q, f]) => window.__mount(r, q, { fresh: f }), [ROLE === "public" ? null : ROLE, p, fresh]); await page.waitForTimeout(1300); };
  await mount(ROLE === "public" ? "/login" : "/" + ROLE, true);
  let paths = [];
  if (ROLE === "public") {
    paths = ["/login", "/nothing-here"];
  } else if (ROLE === "admin") {
    const cid = await page.evaluate(async () => (await window.__get("/classes"))[0].id);
    paths = ["/admin", "/admin/users", "/admin/classes", `/admin/classes/${cid}`, "/admin/school", "/admin/audit", "/admin/audit/tests", "/admin/audit/teachers", "/admin/audit/events", "/admin/profile"];
  } else if (ROLE === "teacher") {
    const t = await page.evaluate(async () => { const tests = await window.__get("/tests"); const cls = await window.__get("/analytics/class?classId=cls-11a&subjectId=sub-phys-11a"); return { draft: tests.find((x) => x.status === "draft")?.id, pub: tests.find((x) => x.status !== "draft")?.id, student: cls.students[0].id }; });
    paths = ["/teacher", "/teacher/materials", "/teacher/clusters", "/teacher/bank", "/teacher/drafts", "/teacher/drafts/new", "/teacher/subjects", `/teacher/drafts/${t.draft}`, "/teacher/live", `/teacher/results/${t.pub}`, "/teacher/review", "/teacher/analytics", `/teacher/analytics/${t.student}`, "/teacher/lms", "/teacher/chat", "/teacher/audit", "/teacher/profile", `/teacher/preview/${t.pub}`];
  } else {
    const s = await page.evaluate(async () => { const tests = await window.__get("/tests"); let attempt = null; try { attempt = (await window.__get("/attempts"))[0]?.id ?? null; } catch {} return { live: tests.find((x) => x.status === "live")?.id, attempt }; });
    paths = ["/student", "/student/tests", "/student/history", ...(s.attempt ? [`/student/history/${s.attempt}`] : []), "/student/lms", "/student/chat", "/student/analytics", "/student/profile", ...(s.live ? [`/take/${s.live}`] : [])];
  }
  if (ONLY) paths = paths.filter((p) => ONLY.some((o) => p.includes(o)));

  for (const p of paths) {
    await mount(p, false);
    const crashed = await page.evaluate(() => window.__crashed());
    const info = await page.evaluate(scroller);
    for (const theme of THEMES) {
      await page.evaluate((t) => { document.documentElement.setAttribute("data-theme", t); document.documentElement.style.colorScheme = t; }, theme);
      await page.waitForTimeout(250);
      const base = `${slug(p)}__${w}__${theme}`;
      fs.mkdirSync(path.join(OUT, theme), { recursive: true });
      await page.screenshot({ path: path.join(OUT, theme, `${base}.png`) });
      const shots = [`${base}.png`];
      if (info) {
        const steps = Math.min(3, Math.ceil(info.sh / info.ch) - 1);
        for (let i = 1; i <= steps; i++) {
          await page.evaluate(([k, ch]) => { document.querySelector("[data-audit-scroller]").scrollTop = k * ch * 0.92; }, [i, info.ch]);
          await page.waitForTimeout(200);
          await page.screenshot({ path: path.join(OUT, theme, `${base}__s${i}.png`) });
          shots.push(`${base}__s${i}.png`);
        }
        await page.evaluate(() => { document.querySelector("[data-audit-scroller]").scrollTop = 0; });
      }
      if (theme === THEMES[0]) {
        const checks = await page.evaluate(CHECKS);
        report.push({ role: ROLE, path: p, width: w, crashed, errors: [...errs], scrollable: info ? `${info.sh}/${info.ch}` : null, ...checks });
      }
    }
  }
  await ctx.close();
  console.log(`width ${w} done (${paths.length} pages)`);
}
fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 1));

// ── findings.md: one line per problem, grouped by page ──
const lines = [`# Mechanical findings — ${ROLE}\n`];
const byPath = {};
for (const r of report) (byPath[r.path] ??= []).push(r);
for (const [p, rs] of Object.entries(byPath)) {
  const rows = [];
  const add = (msg, w) => rows.push([msg, w]);
  for (const r of rs) {
    if (r.crashed) add("CRASH", r.width);
    if (r.errors.length) add(`console errors: ${r.errors[0].slice(0, 80)}`, r.width);
    if (r.hScroll) add("page scrolls sideways", r.width);
    r.wide.forEach((x) => add(`wider than screen: ${x}`, r.width));
    if (r.small.length) add(`${r.small.length} tap target(s) under 24×24 (e.g. ${r.small[0]})`, r.width);
    r.unnamed.forEach((x) => add(`control without a name: ${x}`, r.width));
    r.tinyText.slice(0, 3).forEach((x) => add(`text under 11px: ${x}`, r.width));
    if (r.imgNoAlt) add(`${r.imgNoAlt} image(s) without alt`, r.width);
    if (r.h1 !== 1) add(`${r.h1} h1 headings`, r.width);
    if (r.headingJumps) add(`${r.headingJumps} heading level jump(s)`, r.width);
    r.dupIds.forEach((x) => add(`duplicate id: ${x}`, r.width));
  }
  const grouped = {};
  for (const [m, w] of rows) (grouped[m] ??= []).push(w);
  lines.push(`## ${p}`);
  if (!rows.length) lines.push("- no mechanical findings");
  for (const [m, ws] of Object.entries(grouped)) lines.push(`- ${m} — at ${[...new Set(ws)].join(", ")} px`);
  lines.push("");
}
fs.writeFileSync(path.join(OUT, "findings.md"), lines.join("\n"));
console.log("wrote", OUT);
await browser.close();
