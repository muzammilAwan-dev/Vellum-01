import { createRequire } from "node:module";
const require = createRequire(process.env.PLAYWRIGHT || "/home/claude/.npm-global/lib/node_modules/playwright/");
const { chromium } = require("playwright");
import fs from "node:fs";
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: Number(process.env.W ?? 1280), height: 900 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));
await page.route("http://smoke.local/**", (r) => r.fulfill({ contentType: "text/html", body: "<!doctype html><html><body></body></html>" }));
await page.goto("http://smoke.local/");
await page.addScriptTag({ content: fs.readFileSync("bundle.js", "utf8") });
let failed = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : "  " + extra}`); if (!ok) failed++; };
const mount = async (role, path, fresh = true) => { await page.evaluate(([r, p, f]) => window.__mount(r, p, { fresh: f }), [role, path, fresh]); await page.waitForTimeout(1500); };
const text = () => page.evaluate(() => document.body.innerText);
const errs = () => page.evaluate(() => window.__errors.slice());
const noErrors = async (name) => { const e = [...(await errs()), ...pageErrors]; check(name + ": no errors", e.length === 0, e.join(" | ").slice(0, 300)); pageErrors.length = 0; };

// ── student: LMS ──
await mount("student", "/student/lms");
check("student LMS: course + lessons shown", /Newtonian Mechanics/.test(await text()) && /Introduction to force and motion/.test(await text()));
await page.getByText("Introduction to force and motion").first().click();
await page.waitForTimeout(500);
check("student LMS: lesson opens with a mark button", /Mark as not done|Mark as complete/.test(await text()));
const before = await text();
const wasDone = /Mark as not done/.test(before);
await page.getByRole("button", { name: wasDone ? /Mark as not done/ : /Mark as complete/ }).first().click();
await page.waitForTimeout(1200);
const after = await text();
check("student LMS: toggling progress saves (button flips)", wasDone ? /Mark as complete/.test(after) : /Mark as not done/.test(after), after.slice(0, 100));
await noErrors("student LMS");
// Sidebar badge for courses
check("student sidebar: courses badge present", await page.evaluate(() => /Courses\s*\n?\s*\d/.test(document.body.innerText)));

// ── teacher: LMS editor ──
await mount("teacher", "/teacher/lms");
check("teacher LMS: courses shown", /Newtonian Mechanics/.test(await text()));
await page.getByRole("button", { name: /Add lesson/ }).first().click();
await page.waitForTimeout(500);
check("teacher LMS: lesson editor opens", /New lesson/.test(await text()));
await page.getByPlaceholder(/Newton's three laws/).fill("Smoke-test lesson");
await page.getByPlaceholder(/Write the lesson notes here/).fill("Notes written by the smoke test.");
await page.getByRole("button", { name: /^Add lesson$/ }).last().click();
await page.waitForTimeout(1500);
check("teacher LMS: new lesson appears in the course", /Smoke-test lesson/.test(await text()));
// invalid link is refused with a message
await page.getByRole("button", { name: /Add lesson/ }).first().click();
await page.waitForTimeout(400);
await page.getByRole("button", { name: /^Video$/ }).click();
await page.getByPlaceholder(/Newton's three laws/).fill("Bad link");
await page.getByPlaceholder(/youtube.com/).fill("javascript:alert(1)");
await page.waitForTimeout(300);
check("teacher LMS: javascript: link flagged in the form", /must start with http/.test(await text()));
await noErrors("teacher LMS");

// ── discussion: post a thread + reply (teacher) ──
await mount("teacher", "/teacher/chat");
check("discussion: seeded threads shown", /Lens sign convention/.test(await text()));
await page.getByRole("button", { name: /New thread/ }).first().click();
await page.waitForTimeout(400);
await page.getByPlaceholder("What do you want to talk about?").fill("Smoke thread");
await page.getByPlaceholder(/Explain your question or idea/).fill("Posted by the smoke test.");
await page.getByRole("button", { name: /^Post thread$/ }).click();
await page.waitForTimeout(1500);
check("discussion: new thread appears with the teacher's name", /Smoke thread/.test(await text()) && /Dr\. R\. Chen/.test(await text()));
await noErrors("discussion");

// ── sidebar collapse (desktop) — behaviour only: no stylesheet is loaded here, so sizes can't be judged ──
if ((process.env.W ?? 1280) >= 860) {
  await mount("student", "/student");
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await page.waitForTimeout(400);
  check("sidebar: collapse switches to the expand control", await page.evaluate(() => !!document.querySelector('button[aria-label="Expand sidebar"]')));
  check("sidebar (collapsed): sign-out stays available", await page.evaluate(() => !!document.querySelector('aside button[aria-label="Sign out"]')));
  check("sidebar (collapsed): nav items keep accessible names", await page.evaluate(() => !!document.querySelector('aside a[aria-label="Courses"], aside button[aria-label="Courses"]')));
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  await page.waitForTimeout(300);
  check("sidebar: expands again", await page.evaluate(() => !!document.querySelector('button[aria-label="Collapse sidebar"]')));
  await noErrors("sidebar");
}

// ── refactored forms (state now starts from props instead of a reset effect) ──
// command palette: opens empty, filters, closes, reopens empty
await mount("teacher", "/teacher");
await page.getByRole("button", { name: /Search/ }).first().click();
await page.waitForTimeout(400);
check("palette: opens", await page.getByPlaceholder("Search pages, actions…").isVisible());
await page.getByPlaceholder("Search pages, actions…").fill("bank");
await page.waitForTimeout(300);
check("palette: filters results", /Question bank/i.test(await text()));
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
check("palette: closes on Escape", !(await page.getByPlaceholder("Search pages, actions…").isVisible().catch(() => false)));
await page.getByRole("button", { name: /Search/ }).first().click();
await page.waitForTimeout(400);
check("palette: reopens with an empty query", (await page.getByPlaceholder("Search pages, actions…").inputValue()) === "");
await noErrors("palette");

// bank question modal: blank form, then the same modal reopened is blank again
await mount("teacher", "/teacher/bank");
await page.getByRole("button", { name: "Add a question" }).first().click();
await page.waitForTimeout(500);
check("bank modal: opens as 'Add a question'", /Add a question/.test(await text()));
await page.locator("textarea").first().fill("What is the SI unit of force?");
check("bank modal: typed text stays", (await page.locator("textarea").first().inputValue()) === "What is the SI unit of force?");
await page.getByRole("button", { name: /Cancel/ }).first().click();
await page.waitForTimeout(400);
await page.getByRole("button", { name: "Add a question" }).first().click();
await page.waitForTimeout(500);
check("bank modal: reopened blank", (await page.locator("textarea").first().inputValue()) === "");
await noErrors("bank modal");

// grade review: the detail form restarts for each answer
await mount("teacher", "/teacher/review");
const rows = page.locator('table tbody tr[class*="cursor-pointer"]'); // data rows only: the open panel is a <tr> too
const nRows = await rows.count();
check("grade review: queue has rows", nRows >= 2, `rows=${nRows}`);
if (nRows >= 2) {
  const field = () => page.locator('input[inputmode="decimal"], input[type="number"]').first();
  await rows.nth(1).click(); await page.waitForTimeout(600);
  const own2 = await field().inputValue();
  await rows.nth(0).click(); await page.waitForTimeout(600);
  check("grade review: detail panel opens with a score field", (await field().count()) > 0);
  const own1 = await field().inputValue();
  await field().fill("9"); await page.waitForTimeout(200);
  await rows.nth(1).click(); await page.waitForTimeout(600);
  check("grade review: another answer starts from its own saved score, not the typed one", (await field().inputValue()) === own2, `own2=${own2}`);
  await rows.nth(0).click(); await page.waitForTimeout(600);
  check("grade review: unsaved typing is dropped when you move away and back", (await field().inputValue()) === own1, `own1=${own1}`);
}
await noErrors("grade review");

// materials: outline editor keeps typing, saves
await mount("teacher", "/teacher/materials");
const outline = page.locator("textarea").last();
await outline.fill("Unit 1: Kinematics\nUnit 2: Forces");
await page.waitForTimeout(200);
check("outline: typed text stays", /Unit 2: Forces/.test(await outline.inputValue()));
await page.getByRole("button", { name: /Save/ }).last().click().catch(() => {});
await page.waitForTimeout(1200);
check("outline: still shows the saved text after saving", /Unit 2: Forces/.test(await page.locator("textarea").last().inputValue()));
await noErrors("outline");

// admin: class settings modal starts from the class's values
await mount("admin", "/admin/classes");
await page.waitForTimeout(500);
const classId = await page.evaluate(async () => (await window.__get("/classes"))[0].id);
await mount("admin", `/admin/classes/${classId}`, false);
await page.getByRole("button", { name: "Class settings" }).click();
await page.waitForTimeout(500);
const nameVal = await page.locator('input[type="text"], input:not([type])').last().inputValue();
check("class settings: name field starts from the class", nameVal.length > 0, `name="${nameVal}"`);
await noErrors("class settings");

// student: begin a test and answer a question (TestIntro + TestRunner)
await mount("student", "/student/tests");
const liveId = await page.evaluate(async () => (await window.__get("/tests")).find((t) => t.status === "live")?.id);
if (liveId) {
  await mount("student", `/take/${liveId}`, false);
  const begin = page.getByRole("button", { name: /Begin test|Resume test/ });
  const begun = await begin.first().click({ timeout: 20000 }).then(() => true, () => false);
  check("take test: the intro's begin button starts the test", begun, (await text()).replace(/\n+/g, " | ").slice(0, 400) + " || errors: " + JSON.stringify(await errs()).slice(0, 300));
  await page.waitForTimeout(1500);
  check("take test: runner shows a question", /Question 1|1 \/ \d+|Next/.test(await text()));
  const opt = page.locator("button[aria-pressed]").first();
  check("take test: answer options are present", (await opt.count()) > 0);
  if (await opt.count()) { await opt.click(); await page.waitForTimeout(700); check("take test: answer is recorded", /Answer recorded/.test(await text())); }
  await noErrors("take test");
}

// ── F12c1: parent contact ──
await mount("teacher", "/teacher/analytics/u-sofia.lindqvist");
check("parent contact: teacher's student page shows the card empty", /Parent contact/.test(await text()) && /No parent contact yet/.test(await text()));
await page.getByRole("button", { name: /Add contact/ }).first().click(); await page.waitForTimeout(400);
await page.getByPlaceholder("e.g. Mr. Tariq Mahmood").fill("Mr. Lindqvist");
await page.getByPlaceholder("0300-1234567").first().fill("042-123");
check("parent contact: a landline disables Save and explains", await page.getByRole("button", { name: "Save", exact: true }).isDisabled() && /Enter a Pakistani mobile number/.test(await text()));
await page.getByPlaceholder("0300-1234567").first().fill("+92 300 1234567");
await page.getByRole("button", { name: "Save", exact: true }).click(); await page.waitForTimeout(1200);
check("parent contact: saved, shown masked, full number not on the page", /\+92 300 ••• 4567/.test(await text()) && !/1234567/.test(await text()) && /Mr\. Lindqvist/.test(await text()), (await text()).slice(0, 200));
await page.getByRole("button", { name: "Edit", exact: true }).first().click(); await page.waitForTimeout(400);
check("parent contact: the edit box holds the full number in local form", (await page.getByPlaceholder("0300-1234567").first().inputValue()) === "0300-1234567");
await noErrors("parent contact (teacher)");
await mount("admin", "/admin/users", false);
// U1-admin: row actions live in one "Actions for <name>" menu; "Parent contact" is in it for students only.
const menus = page.getByRole("button", { name: /^Actions for / });
check("accounts: one actions menu per row", (await menus.count()) === (await page.locator("tbody tr").count()) && (await menus.count()) > 0);
// No CSS is loaded here, so the portalled menu would not be position:fixed; focusing it would scroll the
// page, and the menu closes on scroll (by design). Give the harness that one rule.
await page.addStyleTag({ content: "[role=listbox],[role=menu]{position:fixed;top:0;right:0}" });
const openMenu = async (name) => { const b = page.getByRole("button", { name }); await b.scrollIntoViewIfNeeded(); await page.waitForTimeout(250); await b.click(); await page.waitForTimeout(300); };
await openMenu("Actions for Dr. R. Chen");
check("accounts: a teacher's menu has no Parent contact", (await page.getByRole("menuitem", { name: "Parent contact" }).count()) === 0 && (await page.getByRole("menuitem", { name: "Remove account" }).count()) === 1);
await page.keyboard.press("Escape"); await page.waitForTimeout(200);
await openMenu("Actions for Maya Okafor");
const pc = page.getByRole("menuitem", { name: "Parent contact" });
check("parent contact: a student's menu has it", (await pc.count()) === 1);
await pc.first().click(); await page.waitForTimeout(800);
check("parent contact: admin dialog opens with the contact area", /Parent contact ·/.test(await text()) && /Add contact|Edit/.test(await text()));
await noErrors("parent contact (admin)");

// ── F12c2: parent message style ──
await mount("teacher", "/teacher/profile");
check("parent messages: teacher's Profile has the section and a preview", /Parent messages/.test(await text()) && /Assalam o Alaikum Mr\. Tariq/.test(await text()) && /of 600 characters/.test(await text()));
await page.getByRole("button", { name: "Standard", exact: true }).click(); await page.waitForTimeout(300);
check("parent messages: Standard raises the cap and adds the class average to the preview", /of 1200 characters/.test(await text()) && /Class average: 71%/.test(await text()));
await page.getByRole("button", { name: "اردو", exact: true }).click(); await page.waitForTimeout(300);
check("parent messages: Urdu preview uses Urdu labels", /السلام علیکم/.test(await text()) && /اوسط: 78%/.test(await text()));
await page.getByLabel("Greeting").fill("Dear"); await page.waitForTimeout(200);
check("parent messages: own greeting shows in the preview", /Dear Mr\. Tariq,/.test(await text()));
await page.getByRole("button", { name: "Save style" }).click(); await page.waitForTimeout(1200);
check("parent messages: saved (Save is disabled again)", await page.getByRole("button", { name: "Save style" }).isDisabled());
await mount("teacher", "/teacher/profile", false);
check("parent messages: still there after reload", /Dear Mr\. Tariq,/.test(await text()) && /of 1200 characters/.test(await text()));
await noErrors("parent messages (teacher)");
await mount("student", "/student/profile");
check("parent messages: students do not see the section", !/Parent messages/.test(await text()));
await mount("admin", "/admin/profile");
check("parent messages: admins do not see the section", !/Parent messages/.test(await text()));

// ── F12d: share dialog + send queue ──
await mount("teacher", "/teacher/analytics", true);
await page.waitForTimeout(1500);
check("share: analytics offers Send parent reports (whole class)", /Send parent reports/.test(await text()));
await page.getByRole("button", { name: /Send parent reports/ }).click(); await page.waitForTimeout(600);
check("share: dialog shows who, type and both actions", /Share report/.test(await text()) && /Whole class/.test(await text()) && await page.getByRole("button", { name: "Save PDF" }).isVisible() && await page.getByRole("button", { name: "Send on WhatsApp" }).isVisible());
await page.getByRole("button", { name: "One test", exact: true }).click(); await page.waitForTimeout(300);
await page.evaluate(() => { window.__opened = []; window.open = (...a) => { window.__opened.push(a); return null; }; });
await page.getByRole("button", { name: "Send on WhatsApp" }).click(); await page.waitForTimeout(2500);
check("share: queue opens with progress and the WhatsApp notice", /Send reports on WhatsApp/.test(await text()) && /0 of \d+ opened/.test(await text()) && /never post reports in a group/.test(await text()), (await text()).slice(0, 160));
check("share: students without a number get Add number", (await page.getByRole("button", { name: "Add number" }).count()) > 0);
await page.getByRole("button", { name: "Add number" }).first().click(); await page.waitForTimeout(500);
await page.getByRole("button", { name: "Add contact" }).first().click(); await page.waitForTimeout(300);
await page.getByPlaceholder("0300-1234567").first().fill("0300-7654321");
await page.getByRole("button", { name: "Save", exact: true }).click(); await page.waitForTimeout(1500);
check("share: after saving a number the row shows Open WhatsApp", (await page.getByRole("button", { name: "Open WhatsApp" }).count()) === 1);
await page.getByRole("button", { name: "Open WhatsApp" }).click(); await page.waitForTimeout(800);
const opened = await page.evaluate(() => window.__opened);
check("share: Open WhatsApp opens a wa.me link in a new tab without opener", opened.length === 1 && /^https:\/\/wa\.me\/923007654321\?text=/.test(opened[0][0]) && opened[0][1] === "_blank" && opened[0][2] === "noopener", JSON.stringify(opened).slice(0, 160));
check("share: the row says Opened with a time, progress 1 of N, never 'sent'", /Opened \d/.test(await text()) && /1 of \d+ opened/.test(await text()) && !/\bsent\b/i.test(await text()));
await noErrors("share queue");
await mount("teacher", "/teacher/analytics/share", false); await page.waitForTimeout(1500);
check("share: reloading the queue keeps the list and which rows were opened", /1 of \d+ opened/.test(await text()) && /Opened \d/.test(await text()), (await text()).slice(0, 200));
await page.evaluate(() => sessionStorage.clear());
await mount("teacher", "/teacher/analytics/share", false);
check("share: with nothing saved the queue page sends you back", /Nothing to send/.test(await text()));
await mount("teacher", "/teacher/analytics/u-sofia.lindqvist", false);
await page.getByRole("button", { name: "Share report" }).click(); await page.waitForTimeout(500);
check("share: student page opens the dialog for this student", /This student/.test(await text()) && /Share report/.test(await text()));
await noErrors("share dialog (student page)");

// ── F14: privacy policy ──
await mount(null, "/login");
check("privacy: the sign-in page links to the policy", await page.getByRole("link", { name: "Privacy policy" }).isVisible());
await page.getByRole("link", { name: "Privacy policy" }).click(); await page.waitForTimeout(1200);
check("privacy: public page shows the template, the institution and the draft notice", /What we collect/.test(await text()) && /Westfield Institute/.test(await text()) && /has not confirmed this policy yet/.test(await text()) && !/\{\{/.test(await text()), (await text()).slice(0, 200));
await noErrors("privacy page");
await mount("admin", "/admin/institution");
check("privacy: admin editor shows the draft banner and the text box", /Draft\. This wording is a template/.test(await text()) && await page.getByLabel("Privacy policy text").isVisible());
const mine = "## Our promise\nWe keep {{institution}} marks and names safe and we use them only to run tests and report progress to families. " + "Ask the office if you have questions. ".repeat(6) + "\n";
await page.getByLabel("Privacy policy text").fill(mine); await page.waitForTimeout(300);
await page.getByRole("radio", { name: "Preview", exact: true }).click(); await page.waitForTimeout(300);
check("privacy: preview fills in the institution name", /We keep Westfield Institute marks/.test(await text()));
await page.getByRole("checkbox", { name: /legal adviser has reviewed/ }).check();
await page.getByRole("button", { name: "Save policy" }).click(); await page.waitForTimeout(1500);
check("privacy: saved as version 2 and the draft banner is gone", /Version 2/.test(await text()) && !/Draft\. This wording is a template/.test(await text()), (await text()).slice(-300));
await mount(null, "/privacy", false);
check("privacy: public page now shows the saved wording, no draft notice", /Our promise/.test(await text()) && /Version 2/.test(await text()) && !/has not confirmed/.test(await text()));
await mount("teacher", "/teacher/profile", false);
check("privacy: profile page and sidebar link to the policy", (await page.getByRole("link", { name: "Privacy policy" }).count()) >= 2);
await noErrors("privacy links");

console.log(failed ? `\n${failed} FAILED` : "\nall interactions ok");
await browser.close();
process.exit(failed ? 1 : 0);
