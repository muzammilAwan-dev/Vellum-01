# Vellum

AI-assisted testing and grading for schools, colleges and universities. A teacher uploads course material, generates a test from it,
publishes it, watches students sit it live, confirms the grades, and sees where the class and each student stand.
Students take tests, see their results once released, work through lessons, and talk in a class discussion.
Admins manage accounts and classes.

Vellum is a final-year project (planned as a MERN stack). **This repository is the complete frontend, running on a
fake backend that lives in the browser.** The real server is not built yet; the contract it must satisfy is written
down in [`API-CONTRACT.md`](API-CONTRACT.md).

| | |
|---|---|
| **Frontend** | All planned features are built and run end to end against the fake backend. |
| **Backend** | Not started. Planned in [`plan.md`](plan.md) (steps B0 to B13). |
| **Polish** | Ongoing: UI/UX review rounds driven by screenshots, then a final lint/build/a11y pass. |

## Quick start

Requires a current Node LTS (20.19+ or 22+) and npm.

```bash
npm install
npm run dev          # http://localhost:5173, opens in your default browser (add -- --no-open to skip)  (dev.bat on Windows does the same)
```

Sign in from `/login`. The demo has one card per role, and **any password works**:

| Role | Email | Class |
|---|---|---|
| Teacher | `r.chen@westfield.edu` | 11A (Dr. R. Chen) |
| Student | `maya.okafor@westfield.edu` | 11A |
| Admin | `s.whitfield@westfield.edu` | all |

Everything you do is saved in your browser (`localStorage`). To start from the seed data again, run
`__resetVellum()` in the browser console and reload.

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` / `npm run preview` | Production build to `dist/` / serve it locally |
| `npm run lint` | ESLint (flat config, `react-hooks` v7 rules) |
| `npm test` | 656 integration checks against the fake backend. One-time setup: `npm i -D esbuild` |
| `node scripts/ui-audit.mjs` | Grep-based UI audit (focus rings, unlabeled icon buttons, hard-coded colors, ...) |

Environment (`.env.example`): `VITE_USE_MOCK=true` uses the fake backend (default); `false` talks to
`VITE_API_BASE_URL`.

## What each role can do

### Teacher (`/teacher`)

- **Overview**: class average and trend, topics below target, students at risk, pending reviews, latest discussion.
  Numbers come from graded attempts.
- **Subjects, Materials, Clusters, Question bank**: subjects per class with an outline; upload or paste material (text
  is extracted and reviewable); past papers are clustered into recurring question types and can be split question by
  question; a bank of questions with filters, add/edit/duplicate, and "add to draft".
- **New test and draft review**: choose the mix of question types and marks, optional focus topics, and either one test
  for the class or **one variant per student** (each leaning on that student's weak topic). Generation shows progress;
  drafts autosave; questions can be edited and regenerated.
- **Publish**: open now or schedule; result release (immediately or after the test closes); AI grading on/off; allow
  going back; require fullscreen; block copy/paste; shuffle questions and/or options per student.
- **Tests list and Live control**: one main action per test (Publish, Start now, Live view or Results) plus a "more" menu, status filters with counts, class scope; start or stop a test, extend time, a polled roster with progress per student, a
  "no signal" clue for browsers that stopped reporting.
- **Results** (`/teacher/results/:testId`): marks, time taken, flag count by severity and an event timeline per student.
- **Grade review**: approve an AI-drafted mark, override it with feedback, bulk-approve high-confidence marks; a manual
  queue for tests with AI grading off.
- **Analytics**: class trend, topic accuracy with how many students are below target, a student table (CSV export),
  and a profile per student (trend vs class, topic profile, recent attempts). Print to PDF.
- **Grading history** (`/teacher/audit`): every mark you approved or changed and every test you published or edited, with your own totals; admins can see the same record.
- **Courses** and **Discussion**: lessons (text, video, file link) per subject course with ordering and per-lesson
  completion counts; class discussion with pin, resolve, announcements and moderation.

### Student (`/student`)

- **Overview and Progress**: own average vs the class, strongest topic, score trend, topic profile. Only tests whose
  results have been released count.
- **Tests**: open, upcoming, finished and missed tests; intro screen that states exactly what is recorded; the test
  runs against a server-set deadline, answers autosave, tab/focus/fullscreen/copy events are reported, a teacher Stop
  submits everything answered so far.
- **History**: each submitted attempt with marks, correct answers and feedback once the teacher has released them.
- **Courses**: work through lessons, mark them done (saved), "Take the test" on a lesson while its related test is open.
- **Discussion**: ask questions, reply, resolve your own thread.

### Admin (`/admin`)

Accounts (create, edit, activate/deactivate) and classes (create, edit, assign teachers, see the roster). **Audit** (read-only): every published test with its grading trail, showing for each written answer what the student wrote, the AI's draft mark, each teacher action with its reason, and the final mark; filters for changed, overridden, after-release and awaiting answers. An **Overview** shows whether the record is still intact (a "Verify now" check) and the latest activity; an **Events** view lists everything with filters and a CSV export (which is logged too). A **Teachers** view compares how each teacher marks (how many marks they change, in which direction, for which students, and after release) and lists "signals": clues, not proof. Opening a trail or a profile is itself logged.

### Everyone

Light and dark theme, command palette, a sidebar that collapses to a rail on desktop and becomes a drawer on phones.

## How it works

```
Pages → hooks (useResource, cached reads) → api/*.js (one function per endpoint) → api/client.js
                                                                                      │  fetch /api/*
                                                                    src/mocks (fake backend, browser only)
```

- **The frontend shows what it is told.** Test status, deadlines, who may see what, grading totals and result release
  are server rules; the client never decides them.
- **Reads** use `hooks/useResource.js` (de-duplicated, refetched after writes, optional polling). **Writes** are small
  functions in `src/api/*.js`; `call()` adds the bearer token, converts `_id`/ISO dates, maps errors to
  `ApiError { status, code, message }` and refreshes the affected cache keys. A `401` signs the user out.
- **The fake backend** (`src/mocks/`, about 70 endpoints) answers `/api/*` inside the browser with real status
  codes, role scoping, latency and answer keys withheld until release. Only `main.jsx` imports it.
- **Domain rules are pure functions in `src/lib/`** with no UI or mock imports: `analytics`, `antiCheat`,
  `attempts`, `discussion`, `lms`, `questions`, `randomize`, `testSettings`, `resultsView`, `csv`, `textWrap`. The
  real backend will port these files unchanged; the same code runs in the forms and in the fake server.
- **Stand-ins for AI**: question generation (`mocks/generator.js`), written-answer grading (`mocks/grader.js`),
  reading text from images and web research for topics are simulated. The interfaces match the contract; the
  quality does not.

### Rules worth knowing

- **Grading.** Multiple-choice and true/false are marked on submit. Written answers get an AI draft mark with a
  confidence level (when AI grading is on) and stay *pending* until the teacher confirms. Only confirmed marks count.
- **Audit log.** Every write that touches accounts, classes, tests, attempts or marks appends an event to a hash-chained, append-only log (fake backend only for now; admins read it under Audit, teachers see their own under Grading history). A teacher must give a reason when a mark moves 25% or more from the AI's mark, or changes after results are released.
- **Release.** `immediately` shows a student their marks right after submitting; `after_close` waits until the test
  ends. Analytics follow the same rule for students.
- **Anti-cheat events** are *clues, not proof*: ten event types with severities, shown to the teacher with the time
  they happened. A browser that sends nothing for 60 s on a live test is flagged "no signal".
- **Shuffle** is decided once per attempt by the server (seeded by the attempt id) and stored; resuming gives the same
  order. "All of the above" options stay last; true/false is never shuffled.
- **Analytics.** Only attempts whose marks are all final count. A topic or student under 75% is "below target".
  Students see only class *averages* of others, never their marks.
- **Weak topic per variant.** A student's own lowest topic if it is under target; a student with no history inherits
  the class's weakest topic; otherwise none. About a quarter of the variant's questions lean on it.
- **Lessons.** Links must be `http(s)`; a related test must be a published test of the same subject; deleting a test
  unlinks it from lessons.

The full list, with request and response shapes, is in [`API-CONTRACT.md`](API-CONTRACT.md).

## Project layout

```
src/
  api/         one function per endpoint + client, cache, wire conversion
  components/  common/ (shared UI), ui/ (shadcn-style primitives), then one folder per feature area
  context/     AppProvider (session, class/subject scope), ToastProvider; useApp / useToast hooks
  hooks/       data hooks (useResource and friends), useNow, useMediaQuery, useAntiCheat, ...
  layout/      Layout, Sidebar, TopBar, CommandPalette
  lib/         pure domain rules (see above)
  mocks/       the fake backend: handlers, db + seed data, engine rules, AI stand-ins
  pages/       one file per route
  routes/      route table, role guards, paths
  styles/      Tailwind v4 theme tokens (index.css)
tests/         integration.test.js (runs in plain Node)
scripts/       run-tests.mjs, ui-audit.mjs
tools/smoke/   headless-browser smoke test (see below)
docs/archive/  old contract history
```

### Routes

| Role | Paths |
|---|---|
| Public | `/login` |
| Admin | `/admin`, `/admin/users`, `/admin/classes`, `/admin/classes/:classId`, `/admin/audit`, `/admin/audit/tests`, `/admin/audit/tests/:testId`, `/admin/audit/teachers`, `/admin/audit/teachers/:teacherId`, `/admin/audit/events` |
| Teacher | `/teacher` (overview), `materials`, `clusters`, `bank`, `drafts`, `drafts/new`, `drafts/:testId`, `subjects`, `live`, `results/:testId`, `review`, `analytics`, `analytics/:studentId`, `audit`, `lms`, `chat`; `/teacher/preview/:testId` |
| Student | `/student` (overview), `tests`, `history`, `history/:attemptId`, `lms`, `chat`, `analytics`; `/take/:testId` |

Routes are guarded by role; subject-dependent teacher pages wait for a class and subject to be chosen in the sidebar.

## Design system

Direction: parchment written on in ink: a navy rail, a warm paper canvas, pastel KPI cards, one gold accent.
Every color, radius and shadow is a token in `src/styles/index.css`; components never hard-code them.

- **Type:** Plus Jakarta Sans for UI (tabular numerals), Fraunces for titles and the wordmark; 12 px minimum.
- **Themes:** light by default, dark opt-in. `data-theme` is applied before first paint; switching cross-fades.
  Dark is designed separately (tonal near-black, lighter surfaces for elevation, desaturated accents), not inverted.
- **Icons:** `lucide-react` only; no text glyphs as icons. **Motion:** CSS/Tailwind first, `motion-safe`/`motion-reduce`
  respected, `transform`/`opacity` only.
- **Responsive:** breakpoints `narrow` 520 px and `tablet` 860 px (plus Tailwind defaults). `pointer-coarse:` enlarges
  touch targets; dialogs become bottom sheets on phones; wide tables scroll inside their card.
- **Accessibility target:** WCAG 2.2 AA: contrast, visible focus (not hidden under sticky bars), 24 px minimum targets,
  labels on icon-only buttons, status never by color alone.
- **Components:** `components.json` is set up for the shadcn CLI. `button`, `badge` and `input` are already adapted;
  answer *No* when the CLI offers to overwrite them.

Code conventions: semantic tokens only; complete class names (never built from fragments); `cn()` to merge classes;
repeated class lists become a component or a `cva` variant; page layout by breakpoints, reusable parts by container
queries; every data screen has loading, empty, error-with-retry and success states.

## Verification

| Check | Covers | Not covered |
|---|---|---|
| `npm test` (656 checks) | API layer, fake backend, every domain rule, permissions, cascades, the context-field guard | Rendering |
| `tools/smoke` | Every route for admin, teacher and student at 1280 px and 390 px, rendered in headless Chromium with the real route table and fake backend; click-throughs of lessons, discussion, forms, palette, sidebar, taking a test | Layout and styling (no stylesheet is loaded); needs Playwright + Chromium and esbuild, see `tools/smoke/README.md` |
| `node scripts/ui-audit.mjs` | Static UI smells | Anything visual |
| `npm run lint` | Run it on your machine; the last run (47 errors) was fixed in this version | |

Not yet verified by the author: `npm run lint` and `vite build` on this version, and the look of every screen in a
real browser. Those are what the screenshot review rounds are for.

## Connecting a real backend

1. Build the server to `API-CONTRACT.md` (planned: Express + MongoDB under `server/`; see `plan.md`).
2. Port `src/lib/*` rules into the server's domain layer so both sides agree.
3. Set `VITE_USE_MOCK=false` and `VITE_API_BASE_URL`, then delete `src/mocks/`.

Deployment: `netlify.toml` builds with `npm run build`, publishes `dist/`, and rewrites unknown paths to `index.html`
so deep links survive a refresh.

## Known limitations

- Nothing is persisted outside the browser; clearing site data resets the demo.
- AI generation, grading, image reading and topic research are simulated.
- Files are not uploaded: material is pasted text, and lesson files/videos are links.
- Lesson "modules" are a display grouping (three lessons each), not data.
- Not built: editing your own discussion post, notifications, teacher notes on a student, a test filter on the
  analytics page.
- Visible layout has been reviewed from screenshots up to the last review round, not by an automated visual test.

## Documents

- [`plan.md`](plan.md): the living plan and hand-off: status, roadmap, per-step specs, decisions, verification gates, log.
- [`API-CONTRACT.md`](API-CONTRACT.md): the backend contract (endpoints, shapes, rules).
- [`docs/specs/F11-F13-audit-reports-profiles.md`](docs/specs/F11-F13-audit-reports-profiles.md): planned admin audit trail and student history / parent reports (specs per step).
- `src/mocks/README.md`: how the fake backend is organised.
- `tools/smoke/README.md`: the browser smoke test.
