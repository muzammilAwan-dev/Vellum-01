# F11 Audit trail · F12 Student history & parent reports — step specs

Written in the vellum-39 planning chat (2026-10-30). Read `plan.md` §0 first, then **only the card you were told to do**. Do not start the next card.

## 0. Decisions already made by the user (do not re-ask)
1. Context is a **Pakistani school/university**. Dates DD/MM/YYYY style as in `lib/formatters.js`; times shown in the browser's zone (Asia/Karachi for the user), stored as UTC ISO.
2. **Admin becomes a read-only auditor** (new "Audit" area). No superadmin role in the app. Admin can never edit marks, tests or log entries.
3. **Parents get reports from the teacher via WhatsApp or print/PDF.** No share links, no parent login, no email service, no new sharing backend. (A parent role is *future work*, not in this plan.)
4. Audit log is **tamper-evident, not tamper-proof**. In the browser mock it is a demo (localStorage is editable); it becomes real in the backend (B1b). Say "tamper-evident" in UI and docs, never "unforgeable".
5. Signals about teachers are **clues, not proof** (same wording rule as anti-cheat flags).
6. Students never see audit data, AI confidence, or grade history. Parents' reports never contain anti-cheat flags or other students' marks.

## 1. Facts verified in vellum-39 (grep before trusting anything not listed here)
- Mock handlers: `src/mocks/handlers.js` (1712 lines). Routes are objects in `export const routes = [...]` (line ~552): `{ method, path, handler: ({ user, params, query, body, now }) => ... }`. Helpers: `fail(status,message,code)` L52, `as(user,role)` L55, `classesFor(user)` L58, `findTest(id)` L295, `submit(attempt,test,reason,answers,now)` L303, `myAttempt(user,testId)` L450, `queueItems()` L511. Persist with `save()`; read with `db()` (both from `./db`).
- Write handlers that exist (path → line): `POST /auth/login` 556 · `POST /users` 584 · `PUT /users/:id` 609 · `DELETE /users/:id` 633 · `POST /classes` 653 · `PUT /classes/:id` 668 · `DELETE /classes/:id` 685 · `POST /tests/generate` 979 · `PUT /tests/:id` 1019 · `POST /tests/:id/regenerate` 1038 · `POST /tests/:id/duplicate` 1060 · `DELETE /tests/:id` 1086 · `POST /tests/:id/publish` 1102 · `POST /tests/:id/start-now` 1136 · `POST /tests/:id/stop-now` 1150 · `POST /tests/:id/extend` 1160 · `GET /tests/:id/start` 1235 (creates the attempt) · `POST /tests/:id/submit` 1328 · `PATCH /grades/:attemptId/:questionId` 1635 · `POST /grading/approve` 1659 (body `{items:[{attemptId,questionId}]}`) · read `GET /attempts/:id/review` 1680 (student).
- Grade shape today (`attempt.grades[questionId]`): `{ marks, max, status: "pending"|"ai_draft"|"final", source, aiMarks, confidence, rubric[], feedback, reviewedAt }`. PATCH overwrites it in place and sets `source:"teacher"` when marks differ from `aiMarks`. There is **no history and no reason field yet**.
- Attempt fields used here: `id, testId, student (name), questions (snapshot), answers {qid: text|index}, grades, flags[], status, submittedAt, submitReason`. `isReleased(test, attempt, now)` is in `src/mocks/engine.js`.
- DB: `src/mocks/db.js`, `STORAGE_KEY = "vellum.mockdb.v10"`, `version: 10` (bumped in F11a), loaded only if `parsed?.version === 10`. Reset helper `__resetVellum()`.
- Pure libs that exist: `lib/analytics.js` (`pct, scoreAttempt, buildStudentAnalytics, buildClassAnalytics, buildStudentDetail, weakTopicMap, TARGET_PERCENT=75`), `lib/csv.js` (`toCsv, downloadCsv`), `lib/resultsView.js` (flag helpers), `lib/antiCheat.js`, `lib/formatters.js`.
- UI that exists: admin pages `AdminDashboard, AdminUsers, AdminClasses, AdminClassDetail`; teacher `TeacherAnalytics` (`/teacher/analytics`), `TeacherStudentProfile` (`/teacher/analytics/:studentId`, component `components/teacher-analytics/StudentProfile.jsx`), `TeacherGradeReview` + `components/teacher-grade-review/{GradingDetailPanel,ManualGradingQueue}.jsx`; shared `components/ui/{button,badge,input,select}.jsx`, `components/common/*` (Field, ModalShell, TableShell/DataTable, StatusDot, `inputClass`). Print: `window.print()` buttons already exist in `StudentProfile.jsx` and `AnalyticsOverview.jsx`; one `@media print` block in `styles/index.css`.
- Tests: `tests/integration.test.js` (one file, 475 checks, run per plan §0). API layer: one file per area in `src/api/*.js` using `call()`; hooks in `src/hooks/*` using `useResource`.
- **Exists after F11c:** `lib/auditSignals.js`, `GET /audit/teachers[/:teacherId]`, `mocks/auditFixture.js`, admin pages `AdminAuditTeachers`/`AdminAuditTeacher`, grading scoped per teacher class.
- **Exists after F11b:** `lib/auditTrail.js`, `GET /audit/tests[/:testId]`, `hooks/useAudit.js`, `components/admin-audit/*`, pages `AdminAuditTests`/`AdminAuditTest`.
- **Exists after F11a:** `lib/sha256.js`, `lib/audit.js`, `mocks/audit.js`, `mocks/auditHooks.js`, `mocks/auditSeed.js`, `REASON_REQUIRED`, `released` on queue items, `db().auditLog`.
- **Does not exist (do not assume):** event explorer, integrity check, export, teacher's own trail (F11d), parent/guardian fields, `server/`, a PDF library, a WhatsApp helper.

## 2. Event model (F11a defines it; B1b ports it unchanged)
```
AuditEvent = {
  _id, seq (1,2,3… no gaps), at (ISO),
  actor: { id|null, role: "admin"|"teacher"|"student"|"system"|null, name },
  type,                       // see catalogue; lowercase dot form
  entity: { type, id },       // "attempt"|"grade"|"test"|"user"|"class"|"report"|"audit"
  classId|null, testId|null, studentId|null,
  before|null, after|null,    // small JSON; never full answers/keys; marks/status/settings-diff only
  meta: {},                   // reason, bulk, batchId, afterRelease, changed[], channel, ... (no passwords, tokens, answer text)
  prevHash, hash              // hex SHA-256
}
```
- `GENESIS = "0".repeat(64)`. `hash = sha256Hex(prevHash + "\n" + canonicalJson(body))` where `body` is the event **without** `_id, prevHash, hash`. `canonicalJson`: object keys sorted recursively, arrays kept in order, `undefined` dropped, no whitespace.
- `verifyChain(events)` → `{ ok:true, checked }` or `{ ok:false, badSeq, reason:"seq"|"prev"|"hash" }` (first failure only).
- The log is **append-only**: no function may update or delete an event.
- Never log: passwords, tokens, answer keys, student answer text (the trail endpoint reads answers from the attempt, not from events), IP/UA in the mock (`null`).

### Type catalogue (emit exactly these; one event per handler call unless noted)
| type | emitted by | entity | before → after / meta |
|---|---|---|---|
| `auth.login` / `auth.login_failed` | POST /auth/login | user (id or null) | meta `{email}` (failed: actor `{id:null,role:null,name:email}`) |
| `user.create` `user.update` `user.delete` | /users | user | update: `before/after` = changed fields among `role, classIds, active, name, email`; never password |
| `class.create` `class.update` `class.delete` | /classes | class | changed fields |
| `test.generate` `test.regenerate` `test.duplicate` `test.delete` | /tests… | test | meta `{mode}` |
| `test.update` | PUT /tests/:id | test | meta `{changed:["questions"|"settings"|"title"|"schedule"], afterAttempts:boolean}`; after = settings diff |
| `test.publish` | POST …/publish | test | after = `{settingsHash}` (sha256 of canonical settings) |
| `test.start_now` `test.stop_now` `test.extend` | live control | test | extend: meta `{minutes}` |
| `attempt.start` | GET /tests/:id/start (first call only) | attempt | studentId |
| `attempt.submit` | POST …/submit and timeout auto-submit | attempt | meta `{reason, answerDigest}` (digest = sha256 of canonical `answers`) |
| `grade.ai_draft` | grading step inside `submit()` | grade | actor `system`; after `{marks,confidence,status}`; meta `{model:"mock-keyword-v1", rubricHash}` |
| `grade.override` | PATCH /grades (marks ≠ previous marks, incl. draft saves) | grade | before/after `{marks,status}`; meta `{reason, afterRelease, aiMarks, confidence}` |
| `grade.approve` | PATCH /grades (marks unchanged, becomes final) and each item of POST /grading/approve | grade | meta `{bulk:boolean, batchId}` |
| `grade.manual` | PATCH /grades on a mark with no AI mark and no mark yet | grade | before marks null; no reason needed |
| `grade.feedback` | PATCH /grades, marks unchanged, only feedback changed | grade | meta `{afterRelease}` |
| `audit.view` | admin reads a test trail or teacher profile | audit | meta `{what, id}` |
| `audit.export` | admin exports events CSV | audit | meta `{rows}` |
| `report.generate` `report.share` | F12 | report | meta `{channel}` |

## 3. Cards — F11 (audit)

### F11a Event core + emission — DONE (vellum-43)
**Built:** `lib/sha256.js` (sync SHA-256, tested against `node:crypto`), `lib/audit.js` (`GENESIS, canonicalJson, eventBody, hashEvent, verifyChain, needsReason, AUDIT_TYPES, REASON_RATIO=0.25, REASON_MAX_LENGTH=500`), `mocks/audit.js` (`record(state, partial, at)`, `actorOf`, `SYSTEM_ACTOR`), `mocks/auditHooks.js` (route → event table, `withAudit(ROUTES)`, `recordSubmission` called by `submit()`), `mocks/auditSeed.js` (opening log from the seed: publishes, attempt starts/submits, AI draft marks), DB v10 with `auditLog`.
**Decisions taken while building (follow these in F11b+ and B1b):**
- **No `history[]` on grades and no `answerDigest` on attempts.** The log is the history: a mark's trail = events with `entity {type:"grade", id:"<attemptId>:<questionId>"}`. Nothing audit-related is in any student/teacher payload (tested).
- Events are written by `withAudit` hooks, not inside handlers. A failing request logs nothing, except `auth.login_failed`.
- `PUT /tests/:id` is the draft autosave route, so only edits to an already-published test are logged (`test.update`).
- `needsReason({max, current, ai, to, afterRelease})`: false for a first manual mark or no change; true after release for any change; else true when `|to − (ai ?? current)| ≥ 25% of max` (measured from the AI mark so small nudges can't add up). The server enforces it (`REASON_REQUIRED`, 400); the grade panel shows a required "Why are you changing this mark?" box using the same function. Queue items carry `released` so the client can apply the after-release rule.
- `grade.manual` and `grade.feedback` were added to the type catalogue (a first manual mark; a feedback-only edit, flagged when after release).
- The seed has **no teacher actions** (the seeded grading queue must stay pending). The biased-teacher fixture is added in F11c.
- Known limits: the mock hard-deletes tests and their attempts (the log keeps who/when/how many, not the answers). The real backend must soft-delete (B1b/B-tests). Audit time in the mock is the client clock.
**Tests:** +53 (total 545): hash vectors, chain tamper detection (edit, delete, broken link), needsReason boundaries, one-event-per-handler table, reason rules over the API, no-leak checks.
**Not verified:** smoke test in a browser (not run here); the reason box visually.

### F11b Admin audit API + Test audit page — DONE (vellum-44)
**Built:** `lib/auditTrail.js` (pure `buildTrailRows`, `trailTotals`, `filterTrailRows`, `confidenceBand`, `TRAIL_FILTERS`), `GET /audit/tests` and `GET /audit/tests/:testId` in `mocks/handlers.js` (admin only), `audit.view` hook in `auditHooks.js`, `hooks/useAudit.js`, `components/admin-audit/{AuditTestList,TrailFilters,GradingTrail}.jsx`, pages `AdminAuditTests` and `AdminAuditTest`, sidebar item "Audit" (group "Oversight"), palette entry, routes `/admin/audit` (redirects to `tests`), `/admin/audit/tests`, `/admin/audit/tests/:testId`. Contract: "Reading the audit log".
**Decisions taken while building (keep in F11c/d and B1b):**
- Only **written** answers are listed (choice answers are auto-marked, nothing to audit); rows are built from attempts + events, never stored.
- The list shows published tests only (a deleted test is gone from the mock; its events remain and show in the F11d explorer).
- The trail is a **card list** at every width (not a table): each answer needs room for the student's text; below 860 px the two columns stack. Filter chips: all, changed from AI, overridden, after release, awaiting teacher, plus a search over student and question text.
- The UI asks for `limit=500`; if a test ever has more, it says so (paging exists in the API and is tested; no "load more" button yet).
- `/admin/audit` is a redirect today; **F11d replaces it with the overview** and keeps `tests` as the list.
**Tests:** +26 (total 571): admin-only access, list counts, `audit.view` once per open (not per page), row contents for override/approve/awaiting, paging, filters, after-release flag end to end, no hash fields in the payload.
**Not verified:** how the pages look in a browser (phone and laptop), dark theme.

### F11c Teacher fairness profile + signals — DONE (vellum-45)
**Built:** `lib/auditSignals.js` (pure: `computeTeacherStats`, `computeSignals`, `peerMedianRate`, `SIGNAL_THRESHOLDS`, `SIGNAL_META`), `GET /audit/teachers` and `GET /audit/teachers/:teacherId` (admin only; the profile logs `audit.view`), `hooks/useAudit.js` (+2 hooks), `components/admin-audit/{AuditTabs,TeacherAuditList,TeacherProfileAudit,SignalList}.jsx`, pages `AdminAuditTeachers`/`AdminAuditTeacher`, routes `/admin/audit/teachers[/:teacherId]`, a Tests | Teachers tab bar on both list pages. Contract: "Reading the audit log" + signal table.
**Seeded fixture (`mocks/auditFixture.js`, DB seed):** two finished written tests, "Forces — Written Check" (10A, graded by Mrs. L. Park: 6 of 7 changes go up, 3 for one student, 1 change after release) and "Energy — Written Check" (11B, Mr. D. Osei: 2 changes in opposite directions, one 20-mark bulk approve). Dr. Chen has graded nothing. The seeded attempts' marks match the events, so the trail and the signals agree. `auditSeed` now derives `grade.ai_draft` from `aiMarks` (not `source`).
**Decisions taken while building:**
- Signals work from events only (so the backend can run the same code on its log). `max` was added to grade events' `meta` for the confident-AI rule; older events without it are skipped for that rule.
- `OVERRIDE_RATE_HIGH` needs a floor (25%) as well as the 2× factor, so 2% vs 0% never fires, and it is not computed when there is nobody to compare with.
- `EDIT_AFTER_ATTEMPTS` and `OVERRIDE_AGAINST_CONFIDENT_AI` are implemented and unit-tested but have no seeded example: the mock forbids editing a live/finished test, and the seeded AI confidences are below 85%.
- **Bug fixed on the way:** the grading queue, `PATCH /grades` and `POST /grading/approve` were not scoped to the teacher's classes; the new fixture made that visible. All three now only see the teacher's own classes (tested; approving someone else's mark approves and logs nothing).
- Adding two tests changed existing expectations in two tests only (personal-variant "no history" now uses 11B Chemistry; the seed AI-draft count uses `aiMarks`).
**Tests:** +46 (total 617): every signal at its threshold and one below, wording check, stats, seeded teachers/signals/trail agreement, endpoints and scoping.
**Not verified:** how the pages look in a browser.

### F11d Explorer + integrity + overview + teacher's own trail — M
**Endpoints:** `GET /audit/events?actor=&type=&entityType=&classId=&testId=&studentId=&from=&to=&limit=50&cursor=` (seq desc, admin); `GET /audit/integrity` → `verifyChain(...)` plus `{lastSeq, headHash}`; `POST /audit/export-log {rows}` (emits `audit.export`, returns 204); teacher `GET /audit/mine` → only that teacher's `grade.*` and `test.*` events.
**UI:** `/admin/audit` overview (integrity card with "Verify now", count of high signals, last 10 events), `/admin/audit/events` explorer (filters + CSV via `lib/csv.js` + calls export-log), teacher page `/teacher/audit` "My grading history". Dev helper `window.__tamperVellumAudit(seq)` in `mocks/server.js` (changes one stored event) so the demo can show detection; document it in `src/mocks/README.md`.
**Tests:** filters; integrity ok then fails with correct `badSeq` after the helper; export emits event; teacher cannot see others; student 403.
**After F11d:** update README (features list, routes table, Documents) and `API-CONTRACT.md` "Audit" section.

## 4. Cards — F12 (student history & parent reports)

### F12a Student test history (teacher) — M
**Create** `src/lib/studentHistory.js` (pure `buildStudentHistory({student, tests, attempts})` → rows `{testId,title,subject,date,marks,max,percent,classAverage,timeTakenSec,status:"final"|"pending",submitReason,flags:{high,medium,low}}`; percent and class average only from fully-final attempts; pending rows listed but excluded from averages). **Endpoint** `GET /analytics/students/:id/history?subject=&from=&to=` (teacher scoped with `classesFor`). **UI:** "Test history" section in `StudentProfile.jsx` with filters (subject, date range, "final marks only") and CSV via `downloadCsv`. Flags column is teacher-only here.
**Tests:** row maths vs `scoreAttempt`; pending excluded from average; other teacher's student → 404; filters.

### F12b Report builder + print + WhatsApp text — L
**Create** `src/lib/report.js` (pure): `buildReport({student, history, detail, options, now})` → `{header, summary, trend, topics{strong[],weak[]}, tests[], comment, nextSteps[]}`; `nextStepsFromTopics(weak)` (rule-based text, e.g. "Revise <topic>: attempt 5 practice questions before the next test"); `reportToText(report)` → plain text ≤ 1,200 chars using WhatsApp `*bold*`; `normalizePkPhone(input)` → `"923001234567"` or `null` (accepts `03001234567`, `+92 300 1234567`, `0092…`; rejects others); `toWaLink(phone, text)` → `https://wa.me/<digits>?text=<encodeURIComponent(text)>` (verify format against WhatsApp docs at build time, add a line to plan §7). **Route** `/teacher/analytics/:studentId/report` (page `TeacherStudentReport.jsx`, components in `src/components/teacher-report/`). Options (kept with `usePersistentState`): sections to include (summary, trend chart, topics, test list, comment, next steps), date range, subject. Comment is free text with `dir="auto"` (Urdu or English); optional "Draft comment" button fills a rule-based draft the teacher must edit (label it "Draft — edit before sharing"). Actions: **Print / Save as PDF** (`window.print()`), **Copy text**, **Open WhatsApp** (disabled without a valid number; number typed in the dialog, not stored in this step), **Share…** (`navigator.share({title,text})` only if `navigator.share` exists). Print layout: add print rules in `styles/index.css` hiding sidebar/topbar/buttons, A4, one student per page; fonts: keep the stack and append Urdu-capable fallbacks (`"Noto Nastaliq Urdu","Noto Naskh Arabic","Jameel Noori Nastaleeq"`); unverified until opened in a real browser. Report footer: school/class, "Includes confirmed marks as of <date time>", report id (F12c).
**Rules:** no flags, no other students' marks/names, no AI confidence, only final marks; class average allowed.
**Tests (pure):** section toggles; text length cap; `normalizePkPhone` table (≥10 cases); `toWaLink` encoding of Urdu + newlines; flags/other students never present.

### F12c Guardian contacts + report snapshots/log — M
**Mock model:** student users get optional `guardianName` (≤80) and `guardianPhone` (validated with `normalizePkPhone`, stored as typed + normalized). Admin `CreateAccountModal.jsx` (students only) and an edit path in `AdminUsers.jsx` get the two fields. Report page prefills the number. **Endpoints:** `POST /reports {studentId, options}` → stores a snapshot `{id, studentId, createdBy, createdAt, optionsHash, contentHash}` in `db().reports` (emits `report.generate`) and returns the id printed in the footer; `POST /reports/:id/shared {channel:"print"|"pdf"|"whatsapp"|"copy"|"share"}` (emits `report.share`; clicking the buttons calls it). Teacher sees own shared-report list on the report page.
**Tests:** phone validation; teacher scope; events emitted; student/other teacher 403/404.
**Privacy copy on the page:** "WhatsApp is outside Vellum. Send only to the student's parent/guardian. For students 18+ get the student's consent first."

### F12d Class batch reports — M
On `/teacher/analytics`, row checkboxes + "Make reports" opens `/teacher/analytics/reports?ids=a,b,c`: one report per page (`break-after: page`) with the same options, plus a list of students with a **WhatsApp** button each (opens the prepared link for that student's stored number; shows "no number" when missing). Each opened action calls `POST /reports/:id/shared`. Cap 60 students per batch.
**Tests:** id parsing/cap; teacher scope; one snapshot per student.

## 5. Backend cards added (put in plan §5)
**B1b Audit service (M, right after B1).** `server/src/modules/audit/`: Mongo `auditEvents` with unique `seq` and unique `prevHash`; repository exposes `append` + reads only (no update/delete; schema `immutable`, pre-hooks block updates/deletes); `seq` from an atomic counter (`findOneAndUpdate $inc`) with an in-process mutex and bounded retry on unique-index conflict; chain per §2 using `node:crypto` SHA-256 (must produce identical hashes to `lib/sha256.js` — contract test with fixed vectors); **HMAC-SHA256 signature per entry** with `AUDIT_HMAC_KEY` from env (key never in the DB) — a plain hash chain can be recomputed by anyone who can write to the DB; **checkpoint** (`seq`, `hash`, count) every 100 events and daily, written to the app log (outside the DB) and to a `auditCheckpoints` collection; `verify` command + `GET /api/audit/integrity`. Every later B-card that ports a handler must emit the §2 events and add contract tests for them. Admin role: DB user used by the app should have only insert/find on `auditEvents` if Atlas allows custom roles (verify; else code-level guard).
**B14 Reports (S).** Port F12 endpoints (`/reports`, `/reports/:id/shared`, history endpoint, guardian fields on users).

## 6. Research notes (Oct 2026; re-check at build time)
- OWASP logging guidance: audit logs immutable/write-only and access-controlled; log all administrative functions; keep sensitive data out of logs.
- Hash chain alone is not tamper evidence (anyone with DB write can recompute it); add signatures with an external key and anchor checkpoints elsewhere; even then a privileged attacker controlling storage can regenerate a whole chain.
- Canvas Gradebook History / Moodle Grade history: per change store date, student, grader, artifact, before and after; filter by student, grader, artifact, date; Canvas once missed Final Grade Override → every mark-changing path must emit an event.
- AI grading provenance: record model id, prompt version, rubric version, raw output per score; keep human override and AI mark both visible (PrairieLearn shows both and an agreement marker).
- Parent reports: be specific, honest about weak areas, end with practical next steps; let the teacher choose which sections go in the printed/PDF report (NZ PaCT report).
- Pakistan: no enacted comprehensive personal-data-protection law as of mid-2026 (Personal Data Protection Bill still draft); PECA 2016 covers unauthorised access/transmission. Do not cite FERPA as binding. Follow minimal-data practice anyway; this is not legal advice.
- Web Share API: HTTPS only, must run in a user click, `navigator.canShare({files})` needed for files (Chrome/Edge/Safari support; Firefox flagged); a `wa.me` link carries text only. PDF-file sharing from the browser would need a PDF/image library (open decision D13).

## 7. Anti-hallucination checklist for these cards
1. Grep every name before using it; if it is not in §1 and not found, say so and ask — do not invent endpoints, fields or files.
2. One card per chat; list changed files; keep new files ≤ ~300 lines.
3. Contract-first: update `API-CONTRACT.md` and the mock in the same change; add tests in the same change.
4. Bump the mock DB version only in F11a (v9 → v10); F12c changes shape without a bump only if old data still loads (optional fields) — otherwise bump to v11 and say so.
5. Report what was **not** verified (no browser, no lint run).
