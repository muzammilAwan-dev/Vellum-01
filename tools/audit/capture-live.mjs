// U1 live audit: drives the REAL app (`vite`, real fonts, icons, charts, real login page) in a real browser.
// Per page: screenshots at 6 widths x 2 themes, an axe-core scan, mechanical checks, and (desktop width) a Tab walk
// and an ARIA snapshot. Output goes to tools/audit/live/<role>/ and, unless ZIP=0, audit-<role>.zip.
//
//   ROLE=admin|teacher|student|public npm run audit
//
// Env: BASE_URL (use a server that is already running; otherwise a Vite dev server is started on :5199),
//      WIDTHS=360,390,768,1024,1280,1536  THEMES=light,dark  ONLY=<path substrings>  BROWSER=chromium|webkit|firefox
//      FORMAT=jpeg|png (default jpeg q80; Playwright cannot write WebP)  ZIP=0  OUT=<dir>
//      PLAYWRIGHT=<path to the playwright package>  CHROME=<chromium binary> (sandbox only)
import { createRequire } from "node:module";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const pw = process.env.PLAYWRIGHT ? createRequire(path.join(process.env.PLAYWRIGHT, "/"))("playwright") : require("playwright");
const axeSource = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

const ROLE = process.env.ROLE ?? "admin";
const WIDTHS = (process.env.WIDTHS ?? "360,390,768,1024,1280,1536").split(",").map(Number);
const THEMES = (process.env.THEMES ?? "light,dark").split(",");
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
const FORMAT = process.env.FORMAT === "png" ? "png" : "jpeg";
const BROWSER = process.env.BROWSER ?? "chromium";
const OUT = path.resolve(process.env.OUT ?? "tools/audit/live", ROLE);
const HEIGHT = { 360: 740, 390: 844, 768: 1024, 1024: 768, 1280: 800, 1536: 864 };
const DESKTOP = Math.max(...WIDTHS.filter((w) => w <= 1280), WIDTHS[0]); // width used for Tab walk + ARIA snapshot
const DEMO = { admin: "s.whitfield@westfield.edu", teacher: "r.chen@westfield.edu", student: "maya.okafor@westfield.edu" };
fs.rmSync(OUT, { recursive: true, force: true });
for (const d of ["", "aria", ...THEMES]) fs.mkdirSync(path.join(OUT, d), { recursive: true });

// ── dev server ──
let server = null;
let BASE = process.env.BASE_URL;
const up = async (u) => { try { return (await fetch(u)).ok; } catch { return false; } };
if (!BASE) {
  BASE = "http://localhost:5199";
  if (!(await up(BASE))) {
    server = spawn(process.execPath, [path.resolve("node_modules/vite/bin/vite.js"), "--port", "5199", "--strictPort", "--host", "127.0.0.1"], { env: { ...process.env, BROWSER: "none" }, stdio: "ignore" });
    for (let i = 0; i < 60 && !(await up(BASE)); i++) await new Promise((r) => setTimeout(r, 500));
    if (!(await up(BASE))) { console.error("Could not start the Vite dev server"); server.kill(); process.exit(1); }
  }
}

const launchOpts = { headless: true };
if (process.env.CHROME) Object.assign(launchOpts, { executablePath: process.env.CHROME, args: ["--no-sandbox"] });
const browser = await pw[BROWSER].launch(launchOpts);

// ── in-page checks (same list as capture.mjs, plus input zoom and fonts) ──
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
  // iOS Safari zooms the page when a focused field's font is under 16 px
  out.zoomInputs = [...document.querySelectorAll("input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]),select,textarea")].filter((e) => vis(e) && parseFloat(getComputedStyle(e).fontSize) < 16).slice(0, 8).map((e) => `${sel(e)} ${getComputedStyle(e).fontSize}`);
  out.fontsLoaded = [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family.replace(/"/g, "")).filter((x, i, a) => a.indexOf(x) === i);
  out.fontsFailed = [...document.fonts].filter((f) => f.status === "error").map((f) => f.family.replace(/"/g, ""));
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

// Tab walk: press Tab up to N times; record each stop and whether a focus indicator is visible.
const TAB_STATE = () => {
  const e = document.activeElement;
  if (!e || e === document.body) return { body: true };
  const s = getComputedStyle(e); const r = e.getBoundingClientRect();
  const ring = (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) || (s.boxShadow && s.boxShadow !== "none");
  const name = (e.getAttribute("aria-label") || e.innerText || e.getAttribute("title") || e.getAttribute("placeholder") || e.getAttribute("name") || "").trim().replace(/\s+/g, " ").slice(0, 40);
  return { tag: e.tagName.toLowerCase(), role: e.getAttribute("role") || "", name, ring: !!ring, inView: r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth, key: e.tagName + "|" + name + "|" + Math.round(r.left) + "," + Math.round(r.top) };
};
const tabWalk = async (page, n = 60) => {
  await page.evaluate(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0); });
  const stops = []; const seen = new Map();
  for (let i = 0; i < n; i++) {
    await page.keyboard.press("Tab");
    const s = await page.evaluate(TAB_STATE);
    if (s.body) { stops.push({ body: true }); if (stops.filter((x) => x.body).length > 2) break; continue; }
    if (seen.has(s.key)) { stops.push({ ...s, repeat: seen.get(s.key) }); break; }
    seen.set(s.key, i + 1); stops.push(s);
  }
  return {
    stops: stops.length,
    noRing: stops.filter((s) => !s.body && !s.ring).map((s) => `${s.tag} "${s.name}"`).slice(0, 10),
    offscreen: stops.filter((s) => !s.body && !s.inView).map((s) => `${s.tag} "${s.name}"`).slice(0, 10),
    lostToBody: stops.slice(0, -1).filter((s) => s.body).length, // a final body stop is just the wrap-around
    cycleAfter: stops.find((s) => s.repeat)?.repeat ? stops.length - 1 : null, // whole page cycles back = good; early cycle = trap
    order: stops.filter((s) => !s.body).map((s) => `${s.role || s.tag}:${s.name}`),
  };
};

const runAxe = async (page) => {
  await page.evaluate(axeSource);
  return page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] }, resultTypes: ["violations"] });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, targets: v.nodes.slice(0, 3).map((n) => n.target.join(" ").slice(0, 120)) }));
  });
};

const slug = (p) => (p === "/" + ROLE ? "home" : p.replace(/^\/|\/$/g, "").replace(/[/:]/g, "-") || "root");
const shot = (page, file) => page.screenshot({ path: file, ...(FORMAT === "jpeg" ? { type: "jpeg", quality: 80 } : { type: "png" }) });
const ext = FORMAT === "jpeg" ? "jpg" : "png";

// ── sign in through the real login page ──
const signIn = async (page) => {
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: new RegExp("^" + ROLE, "i") }).first().click();
  await page.fill("#email", DEMO[ROLE]);
  await page.fill("#password", "demo-password-1");
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 }), page.locator("form button[type=submit]").click()]);
  await page.waitForLoadState("networkidle");
};

// Route list: ids come from the app's own (mock) API, called from inside the signed-in page
const discover = (page) => page.evaluate(async () => {
  const get = async (p) => { try { const r = await fetch("/api" + p, { headers: { Authorization: "Bearer " + localStorage.getItem("authToken") } }); return r.ok ? await r.json() : null; } catch { return null; } };
  const classes = (await get("/classes")) ?? [];
  const tests = (await get("/tests")) ?? [];
  const attempts = (await get("/attempts")) ?? [];
  const cls = await get("/analytics/class?classId=cls-11a&subjectId=sub-phys-11a");
  const id = (x) => x?._id ?? x?.id ?? x?.studentId;
  return {
    cid: id(classes[0]),
    draft: id(tests.find((t) => t.status === "draft")),
    pub: id(tests.find((t) => t.status !== "draft")),
    student: id(cls?.students?.[0]),
    attempt: Array.isArray(attempts) ? id(attempts[0]) : undefined,
  };
});
const pathsFor = (ids) => ({
  public: ["/login", "/privacy", "/nothing-here"],
  admin: ["/admin", "/admin/users", "/admin/classes", `/admin/classes/${ids.cid}`, "/admin/institution", "/admin/audit", "/admin/audit/tests", "/admin/audit/teachers", "/admin/audit/events", "/admin/profile"],
  teacher: ["/teacher", "/teacher/materials", "/teacher/clusters", "/teacher/bank", "/teacher/drafts", "/teacher/drafts/new", "/teacher/subjects", `/teacher/drafts/${ids.draft}`, "/teacher/live", `/teacher/results/${ids.pub}`, "/teacher/review", "/teacher/analytics", `/teacher/analytics/${ids.student}`, `/teacher/analytics/${ids.student}/report`, "/teacher/analytics/share", "/teacher/lms", "/teacher/chat", "/teacher/audit", "/teacher/profile", `/teacher/preview/${ids.pub}`],
  student: ["/student", "/student/tests", "/student/history", ...(ids.attempt ? [`/student/history/${ids.attempt}`] : []), "/student/lms", "/student/chat", "/student/analytics", "/student/profile"],
}[ROLE]);

const report = [];
for (const w of WIDTHS) {
  for (const theme of THEMES) {
    const ctx = await browser.newContext({ viewport: { width: w, height: HEIGHT[w] ?? 800 }, deviceScaleFactor: 1, hasTouch: w < 860, isMobile: w < 520 && BROWSER !== "firefox", reducedMotion: "reduce" });
    await ctx.addInitScript((t) => { try { localStorage.setItem("vellum.theme", JSON.stringify(t)); } catch { /* ignore */ } }, theme);
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
    if (ROLE !== "public") await signIn(page); else await page.goto(BASE + "/login", { waitUntil: "networkidle" });
    const paths = pathsFor(await discover(page)).filter((p) => !ONLY || ONLY.some((o) => p.includes(o)));
    for (const p of paths) {
      errs.length = 0;
      await page.goto(BASE + p, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(900);
      const crashed = await page.evaluate(() => /something went wrong|unexpected application error/i.test(document.body.innerText));
      const info = await page.evaluate(scroller);
      const base = `${slug(p)}__${w}__${theme}`;
      await shot(page, path.join(OUT, theme, `${base}.${ext}`));
      if (info) {
        const steps = Math.min(3, Math.ceil(info.sh / info.ch) - 1);
        for (let i = 1; i <= steps; i++) {
          await page.evaluate(([k, ch]) => { const el = document.querySelector("[data-audit-scroller]"); if (el) el.scrollTop = k * ch * 0.92; }, [i, info.ch]);
          await page.waitForTimeout(150);
          await shot(page, path.join(OUT, theme, `${base}__s${i}.${ext}`));
        }
        await page.evaluate(() => { const el = document.querySelector("[data-audit-scroller]"); if (el) el.scrollTop = 0; }); // the box can re-render away mid-capture
      }
      const row = { role: ROLE, path: p, width: w, theme, crashed, errors: [...errs], scrollable: info ? `${info.sh}/${info.ch}` : null, ...(await page.evaluate(CHECKS)), axe: await runAxe(page) };
      if (w === DESKTOP && theme === THEMES[0]) {
        row.tab = await tabWalk(page);
        try { fs.writeFileSync(path.join(OUT, "aria", `${slug(p)}.yml`), await page.locator("body").ariaSnapshot()); } catch { /* old browser */ }
      }
      report.push(row);
    }
    await ctx.close();
    console.log(`width ${w} ${theme} done (${paths.length} pages)`);
  }
}
fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 1));

// ── findings.md ──
const lines = [`# Live findings — ${ROLE} (${BROWSER}, real app)\n`];
const byPath = {};
for (const r of report) (byPath[r.path] ??= []).push(r);
for (const [p, rs] of Object.entries(byPath)) {
  const g = {};
  const add = (m, r) => (g[m] ??= new Set()).add(`${r.width}${r.theme === "dark" ? "d" : ""}`);
  for (const r of rs) {
    if (r.crashed) add("CRASH", r);
    r.errors.slice(0, 2).forEach((e) => add(`console error: ${e.slice(0, 90)}`, r));
    if (r.hScroll) add("page scrolls sideways", r);
    r.wide.forEach((x) => add(`wider than screen: ${x}`, r));
    if (r.small.length) add(`${r.small.length} tap target(s) under 24×24 (e.g. ${r.small[0]})`, r);
    r.unnamed.forEach((x) => add(`control without a name: ${x}`, r));
    r.tinyText.slice(0, 3).forEach((x) => add(`text under 11px: ${x}`, r));
    if (r.imgNoAlt) add(`${r.imgNoAlt} image(s) without alt`, r);
    if (r.h1 !== 1) add(`${r.h1} h1 headings`, r);
    if (r.headingJumps) add(`${r.headingJumps} heading level jump(s)`, r);
    r.dupIds.forEach((x) => add(`duplicate id: ${x}`, r));
    if (r.width < 520) r.zoomInputs.forEach((x) => add(`iOS zooms on focus (font < 16px): ${x}`, r));
    r.fontsFailed.forEach((x) => add(`font failed to load: ${x}`, r));
    r.axe.forEach((v) => add(`axe ${v.impact} ${v.id} ×${v.nodes}: ${v.help} (e.g. ${v.targets[0]})`, r));
    if (r.tab) {
      r.tab.noRing.forEach((x) => add(`Tab: no visible focus indicator on ${x}`, r));
      r.tab.offscreen.forEach((x) => add(`Tab: focus lands off screen on ${x}`, r));
      if (r.tab.lostToBody) add(`Tab: focus drops to the page body ${r.tab.lostToBody}×`, r);
    }
  }
  lines.push(`## ${p}`);
  if (!Object.keys(g).length) lines.push("- no findings");
  for (const [m, ws] of Object.entries(g)) lines.push(`- ${m} — at ${[...ws].join(", ")} (d = dark)`);
  const tab = rs.find((r) => r.tab)?.tab; if (tab) lines.push(`- tab order (${tab.stops} stops): ${tab.order.slice(0, 14).join(" → ")}${tab.order.length > 14 ? " …" : ""}`);
  lines.push("");
}
fs.writeFileSync(path.join(OUT, "findings.md"), lines.join("\n"));
console.log("wrote", OUT);
await browser.close();
server?.kill();

if (process.env.ZIP !== "0") {
  const zip = path.resolve(OUT, "..", `audit-${ROLE}.zip`);
  fs.rmSync(zip, { force: true });
  const r = process.platform === "win32" ? spawnSync("tar", ["-a", "-cf", zip, "-C", OUT, "."]) : spawnSync("zip", ["-qr", zip, "."], { cwd: OUT });
  console.log(r.status === 0 ? `zipped → ${zip}` : "zip failed (install zip, or set ZIP=0 and zip the folder yourself)");
}
