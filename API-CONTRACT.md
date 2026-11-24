# API Contract — Frontend ↔ Backend

**Source of truth** for every endpoint the app uses (`src/api/*.js`). The fake server in
`src/mocks/` is the reference implementation of these rules; the real backend (`server/`)
must pass the same contract tests. Any change: update this file + mock + server + test together.
Turn the mock off with `VITE_USE_MOCK=false` and set `VITE_API_BASE_URL`.

## Conventions (every endpoint)

- **Auth:** `Authorization: Bearer <token>`. A `401` sends the user to login
  (one handler, `onUnauthorized` in `api/client.js`). The token user decides
  scope: teachers see their own tests and grading queue; students see only
  their class's published tests and their own attempts.
- **Errors:** non-2xx with JSON `{ "message": string, "code"?: string }`.
  `message` is shown to users as-is. Codes the UI reacts to: `NOT_RELEASED`
  (403), `NOT_OPEN` (409), `NO_VARIANT` (403), `INVALID_MARKS` (400), `REASON_REQUIRED` (400).
- **Ids:** `_id` or `id` — both accepted (`api/wire.js` renames `_id`).
- **Times:** ISO-8601 strings on the wire. These fields are converted to
  millisecond timestamps in the UI: `createdAt`, `updatedAt`, `publishedAt`,
  `stoppedAt`, `startedAt`, `deadline`, `submittedAt`, `availableFrom`,
  `availableUntil`, `at`, `reviewedAt`, `closesAt`. Anything else stays as sent.
- **Answer keys never reach a student before release:** `correctIndex`,
  `expectedAnswer` and `rubric` must be stripped from the questions inside a
  student's attempt until their result is released.

## Auth

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/auth/login` | `{ email, password }` → `{ token, user }`. 401 with `{ message }` on bad credentials; `403 ACCOUNT_DISABLED` for a deactivated account (whose existing tokens also get 401) |
| GET | `/api/auth/me` | The signed-in user. A 401 here ends the session |
| POST | `/api/auth/change-password` | `{ current, next }` → **204**. Clears `mustChangePassword`, sets `passwordChangedAt`, writes `auth.password_changed` (no values). `400` with `code` = `INVALID_INPUT` (missing field), `TOO_SHORT`, `TOO_LONG`, `SAME_AS_CURRENT`, `CONTAINS_EMAIL`, `TOO_COMMON` (first failing rule, order as listed) or `WRONG_PASSWORD` (real server only: the fake server keeps no passwords, so it cannot check `current`). `message` is user-readable |

`user` = `{ id, name, email, role: "admin"|"teacher"|"student", active, mustChangePassword, cls?, classId?, roll? (students), classIds? (teachers) }`.
The role comes from the account; the UI shows the screens for it and the
server must enforce it on every endpoint (403 otherwise).

**Passwords (F13b; rules in `src/lib/password.js`, NIST SP 800-63B-4).** Min 15 characters (NIST's floor for a password that is the only factor), max 128, spaces and any Unicode allowed, **no composition rules**, whole-password blocklist, no scheduled expiry. A new or reset account has `mustChangePassword: true` and a server-generated temporary password (16 random characters, shown once to the admin, never stored in readable form, never in the audit log). **Backend (B15):** while `mustChangePassword` is true answer `403 PASSWORD_CHANGE_REQUIRED` to everything except `/auth/*` and `GET /profile`; the browser mock only redirects to the Profile page. Hash with argon2id/bcrypt, screen against a breached-password list, rate-limit `/auth/*`.

## Profile (F13a)

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/profile` | Any role, **own data only**. `{ id, name, email, role, rollNo? (students), classes: [{id, code, name}], subjects: [{id, name, classId}], bio, phone, photoUrl, prefs, previousLoginAt, passwordChangedAt }`. `bio`/`phone` default `""`, `prefs` `{}`, `photoUrl` `null` until F13d; admins get empty `classes`/`subjects`. `previousLoginAt` = the sign-in before the current one (from `auth.login` events), `null` if none; `passwordChangedAt` = last own change (`null` = never) |
| PATCH | `/api/profile` | `{ bio?, phone?, prefs? }` → the updated profile. Bio ≤ 200 chars; phone ≤ 20 chars of digits, `+`, space, `-`; `prefs` an object, **merged by top-level key** (`null` deletes a key), ≤ 2 KB after the merge. Values are trimmed. `400 INVALID_PROFILE` for anything else, including `name`, `email`, `role`, `roll` (identity is admin-only: `PUT /users/:id`) or an empty body. Writes `profile.update` with `meta.changed` = field names only (never values), and nothing when no value changed |

**`prefs.parentSummary` (F12c2, teachers only; a student or admin gets `400 INVALID_PROFILE`)** is the style of the WhatsApp message to parents: `{ sections: ["result"|"trend"|"strong"|"weak"|"comment"] (no duplicates), language: "en"|"ur"|"both", greeting: string ≤ 60 ("" = the language's usual greeting), signoff: string ≤ 60 ("" = usual closing), emoji: boolean, length: "short"|"standard" }`; every key optional, unknown keys and wrong values are `400`. Checked by `validateSummaryPrefs` and used by `buildSummaryText` in `src/lib/summary.js` (pure; the server ports both). The text is built in the browser from a report and never stored; a short message is ≤ 600 characters, standard ≤ 1,200, and both must fit one `wa.me` link (`fitsWhatsApp`), otherwise it is trimmed (comment first, then topics, then everything but the result).

Rules live in `src/lib/profile.js` (pure; the server ports them). The wire time field `previousLoginAt` is an ISO string.

## Institution (F13c)
One institution per installation: a school, college or university. Its name and logo appear on the sign-in page, the sidebar, test pages, the browser tab and printed reports.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/institution/public` | **No sign-in needed** (login page, tab title). `{ name, shortName, logo }` only: never contacts or the photo switch. Cached under `["branding"]`, refreshed when the admin saves |
| GET | `/api/institution/privacy` | F14. **No sign-in needed** (the public `/privacy` page). `{ text, version, effectiveDate \| null, updatedAt, reviewed }` where `text` has the `{{placeholders}}` filled in from the institution settings (name, city, email, and the photo paragraph only while `allowStudentPhotos` is on), so renaming the institution or changing its email changes the public text without re-saving the policy. An **admin** also gets `{ source (the text as saved, with placeholders), isTemplate }`. Nothing saved yet → the built-in template, version 1, `reviewed: false` |
| PUT | `/api/institution/privacy` | Admin only (`403` otherwise, `401` signed out). **Partial update** `{ text?, effectiveDate? ("YYYY-MM-DD" \| "" \| null), reviewed? }` → the admin view. `text`: plain text, 200–20,000 characters after trimming, a line starting with `## ` is a heading (other `#` lines refused), `- ` is a bullet, **no HTML**, placeholders only `{{institution}}` `{{contactEmail}}` `{{city}}` and blocks `{{#photos}}…{{/photos}}`, `{{#city}}`, `{{#contactEmail}}` (unknown ones or unclosed blocks refused). `400 INVALID_PRIVACY` with the first problem; nothing changes. **`version` goes up only when the wording changes** (not for the date or `reviewed`). Writes `privacy.update` with `meta { changed: ["text"\|"effectiveDate"\|"reviewed"], version }` only when something changed, **never the text**. Rules in `src/lib/privacy.js` (pure; the server ports it, B15) |
| GET | `/api/institution` | Any signed-in role. `{ name, shortName, city, phone, email, logo, allowStudentPhotos, updatedAt }`. Defaults when never set: `name "Westfield Institute"`, `shortName "Westfield"`, empty strings, `logo null`, `allowStudentPhotos false`, `updatedAt null`. `logo` is a PNG/JPEG data URL (the real server may serve a URL instead) |
| PUT | `/api/institution` | Admin only (403 otherwise). **Partial update**: only the fields sent change. name 1–80, shortName 1–30, city ≤60, phone ≤20 (digits, `+`, space, `-`), email empty or valid (≤120), logo `null` or a `data:image/(png\|jpeg);base64,…` ≤100 KB decoded (resized to ≤256 px wide in the browser; SVG and GIF refused), `allowStudentPhotos` boolean. Values are trimmed. `400 INVALID_INSTITUTION` for anything else, including `updatedAt` or an empty body. Writes `institution.update` with `meta.changed` = field names only (never values), nothing when no value changed |

Rules live in `src/lib/institution.js` (`brandingOf` builds the public subset) (pure; the server ports them). `allowStudentPhotos` is the switch F13d reads: students may add a photo, and their teachers see it, only while it is on.

## Photos (F13d)

| Method | Endpoint | Purpose |
|---|---|---|
| PUT | `/api/profile/photo` | `{ dataUrl }` → the profile. A JPEG/PNG/WebP data URL ≤ 60 KB decoded (the browser crops to a square and re-encodes a 256 px JPEG, which drops EXIF; the real server should re-encode again and store a file). `400 INVALID_PHOTO`; **`403 PHOTOS_DISABLED` for a student while `school.allowStudentPhotos` is off**. Writes `profile.photo_set` (no image data) |
| DELETE | `/api/profile/photo` | Removes your own → the profile. Writes `profile.photo_removed` only if there was one |
| DELETE | `/api/users/:id/photo` | Admin only → **204**. Event `profile.photo_removed` with `meta.by = "admin"`. `404` |

**Who sees a photo** (`src/lib/photoPolicy.js`, pure; the server ports it): you see your own; the admin sees all; staff photos are visible to every signed-in user; **a student never sees another student's**; a teacher sees a student's photo only for their own classes **and only while `allowStudentPhotos` is on**. Switching the setting off hides student photos from teachers at once (nothing is deleted; the owner and the admin still see theirs). Every payload that carries a person returns `photoUrl` (user, profile, `/users`, roster rows) or `authorPhotoUrl` (discussion threads and replies) **only when the viewer may see it, else `null`**; the mock does this in one function, `photoFor(viewer, owner)`. The real server should return a URL (e.g. `/api/photos/:userId?v=<hash>`, authorised per request, `Cache-Control: private`) instead of a data URL.

## Reads (what each screen loads)

| Method | Endpoint | Returns | Used by |
|---|---|---|---|
| GET | `/api/tests` | Teacher: own tests, with `questionSet` / `variants`. Student: published tests of their class **without questions**. Both: server-computed `status` (`draft`\|`scheduled`\|`live`\|`completed`), `settings` (complete), `questionCount`, `totalMarks` (per student). Re-fetched every 30 s | drafts, review, live, student tests |
| GET | `/api/attempts` | The student's own attempts. Each has `questions` (snapshot, no answer key), `answers`, `flags`, `status`, `deadline`, and **`released`** and **`totals`** (`null` until released) | student tests, history |
| GET | `/api/tests/:id/attempts` | Teacher: one row per student in the class — `{ student: { id, name, roll }, attempt: { id, status, startedAt, deadline, submittedAt, submitReason, progress: { answered, total }, flags: [{ type, at }], lastSeenAt, clientSilent, marks } \| null }` (`marks`: `{ earned, max, complete, notFinal }` once submitted, final marks only, else null; `lastSeenAt`/`clientSilent` as in Results below). Never the answers. Polled every 20 s | live control |
| GET | `/api/analytics/me` | Student: own progress — see "Analytics" | student dashboard, progress |
| GET | `/api/analytics/class?classId=&subjectId=` | Teacher: class + subject picture — see "Analytics" | teacher dashboard, analytics |
| GET | `/api/analytics/students/:id?classId=&subjectId=` | Teacher: one student — see "Analytics" | student profile |
| GET | `/api/analytics/students/:id/history?subject=&from=&to=` | Teacher: one student's submitted tests, all subjects — see "Analytics" | student profile (Test history) |
| GET | `/api/grading/queue` | Teacher: written answers to review — see "Grading" | grade review |
| GET | `/api/courses?subjectId=` | Teacher: the subject's courses. Student (no params): every course of their class — see "Courses & lessons" | courses |
| POST | `/api/courses` | Teacher: `{ subjectId, title }` | courses |
| PUT / DELETE | `/api/courses/:id` | Teacher: rename / delete (cascades lessons + progress) | courses |
| POST | `/api/courses/:id/lessons` | Teacher: add a lesson (appended) | courses |
| PUT | `/api/courses/:id/lessons/order` | Teacher: `{ ids }` = every lesson once | courses |
| PUT / DELETE | `/api/lessons/:id` | Teacher: edit / delete (remaining lessons renumbered) | courses |
| PUT | `/api/lessons/:id/progress` | Student: `{ done: boolean }`, idempotent | courses |
| GET / POST | `/api/threads` | Discussion: list a class's threads (teacher `?classId=`, student implied) / start one — see "Class discussion" | discussion |
| PUT / DELETE | `/api/threads/:id` | `{ pinned? }` teacher, `{ resolved? }` teacher or author / delete (teacher) | discussion |
| POST | `/api/threads/:id/replies` | `{ body }` | discussion |
| DELETE | `/api/threads/:id/replies/:replyId` | Teacher | discussion |
| GET | `/api/attempts/:id/review` | Student: one released attempt, question by question — see "Grading". `403 NOT_RELEASED` while hidden | history review |

Every read goes through one hook shape: `{ data, isLoading, error, refetch }`
(`hooks/useResource.js`). After a successful write the matching keys are
refetched (`api/cache.js`), so the backend never has to push updates.

## Admin: accounts & classes

All admin only (403 otherwise). Writes refetch the users and classes lists.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/users` | Every teacher and student (never admins); optional `?role=`. `[user]` shape above, and for students `hasParentContact: boolean` (a WhatsApp number is on file; never the number itself; U1-admin, vellum-64) |
| POST | `/api/users` | `{ name, email, role: "teacher"\|"student", classId? (required for students), classIds? (teachers), guardianName?, guardianPhone? (students only, F12c1: `400 INVALID_GUARDIAN` if the number is not a Pakistani mobile; `400 INVALID_INPUT` for a teacher; nothing is created on error) }`. Server lowercases the email, assigns a student's roll number (`11A-07`) and returns the user plus a one-time `temporaryPassword` (never emailed, never readable again; the account has `mustChangePassword: true`). `409 DUPLICATE_EMAIL`, `400 INVALID_INPUT` |
| POST | `/api/users/:id/reset-password` | No body → `{ temporaryPassword }`, shown once; sets `mustChangePassword`; writes `auth.password_reset` (actor = admin, entity = the account, never the password). `404`; `409 CANNOT_CHANGE_ADMIN` |
| PUT | `/api/users/:id` | `{ active? }` and/or, for students, `{ classId }` (`null` unassigns; a new class gets a new roll). `409 CANNOT_CHANGE_SELF` / `CANNOT_CHANGE_ADMIN` |
| DELETE | `/api/users/:id` | Removes the account and its class links; test history stays. `409 CANNOT_CHANGE_ADMIN` |
| POST | `/api/classes` | `{ name, teacherIds? }`. The server derives `code` ("Grade 11 — Section A" → `11A`) and the id. `409 DUPLICATE_CLASS`, `400 INVALID_INPUT` (a non-teacher in `teacherIds`) |
| PUT | `/api/classes/:id` | `{ name?, teacherIds? }`; the code never changes (tests and students reference it) |
| DELETE | `/api/classes/:id` | `409 CLASS_IN_USE` while it has tests; otherwise students are unassigned and its subjects removed |
| GET | `/api/classes/:id/roster` | `{ teachers: [{ id, name, email, classCount }], students: [{ id, name, roll, email, active, average }] }`. `average` = mean % over submitted tests, `null` before the first |

`GET /api/classes` items also carry `subjectCount` and `teachers: [{ id, name }]`.

## Classes & subjects

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/classes` | Classes the user can see: teacher → the ones they teach, student → their own, admin → all. `[{ id, code, name, studentCount }]` |
| GET | `/api/subjects` | Subjects in those classes (optional `?classId=`), creation order — the first is a class's default. `[{ id, classId, name, outline, createdAt, updatedAt }]` |
| POST | `/api/subjects` | Teacher. Body `{ classId, name, outline? }`. `400 INVALID_SUBJECT` (blank / over 60 chars), `409 DUPLICATE_SUBJECT` (same name in the class, case-insensitive), `404` for a class they don't teach |
| PUT | `/api/subjects/:id` | Teacher. Body `{ name?, outline? }` (outline ≤ 20,000 chars). A rename updates `test.subject` on that subject's tests |
| DELETE | `/api/subjects/:id` | Teacher. `409 SUBJECT_IN_USE` while tests reference it |
| POST | `/api/subjects/:id/materials` | See "Materials upload" below. `404` if the subject isn't one of theirs |

Tests carry `subjectId` (and the subject's `name` as `subject`, for display).

## Materials upload

`POST /api/subjects/:id/materials` — teacher, `multipart/form-data`, up to 20 items (25 MB per file; PDF, JPG, PNG, HEIC, plain text, or pasted text).

| Field | Meaning |
|---|---|
| `manifest` | JSON array, one entry per item **in order**: `{ source: "file"\|"text", name, tag: "outline"\|"pastpaper", year? }`. `year` (1990 – this year) is only valid for past papers and is optional |
| `files` | The file items, repeated, same relative order as the manifest's `source: "file"` entries |
| `pastedText` | The pasted-text items, repeated, same relative order as the `source: "text"` entries |

Response `200`: `{ topics: [{ name, weight, thin }], items: [...], warnings: [] }`. `items` has one result per submitted item, same order: `{ index, name, tag, year?, status: "extracted"\|"failed", route: "direct"\|"vision"\|"ocr"\|"as-is", chars, warnings: [], id?, quality?, error? }`. Extracted items are stored on the subject and come back with an `id` and a `quality` ("high" direct/as-is, "med" vision, "low" OCR); failed items and rejected (4xx) uploads store nothing. One unreadable file comes back `failed` (with `error`) without failing the batch; `topics` is empty when nothing could be read. Batch `warnings` flag things like past papers with no year.

Request-level errors: `400 INVALID_UPLOAD` (no/garbled manifest, counts don't match), `INVALID_TAG`, `INVALID_YEAR`, `TOO_MANY_ITEMS`; `413 FILE_TOO_LARGE`; `415 UNSUPPORTED_TYPE`; `404` unknown subject.

### Reviewing and correcting extracted text

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/subjects/:id/materials` | Teacher. Everything uploaded to the subject, oldest first: `[{ id, subjectId, name, tag, year?, route, quality, chars, text, edited, warnings, createdAt }]` |
| PUT | `/api/materials/:id` | Teacher. `{ text }` — the corrected text; this is what topic detection and question generation use. `400 INVALID_TEXT` (empty), `413 INVALID_TEXT` (over 200,000 chars), `404` |
| POST | `/api/materials/:id/reextract` | Teacher. Discards edits and re-reads the original → Material (`edited: false`). Not offered for pasted text |
| DELETE | `/api/materials/:id` | Teacher. Removes the item from the subject; tests already made keep their questions. `404` if it isn't theirs |

The course outline is the subject's own `outline` text (`PUT /api/subjects/:id { outline }`, up to 20,000 chars); the Materials screen can pre-fill it from the items tagged Outline.

### Recurring questions (clusters)

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/subjects/:id/clusters?threshold=` | Teacher. Groups the subject's past-paper questions by meaning. `threshold` 0.1–0.9 (default 0.3; higher = stricter, more and smaller groups; `400 INVALID_THRESHOLD`). → `{ threshold, questionCount, papers: [{ id, name, year?, questionCount }], clusters: [{ id, label, count, paperCount, years: [], sample, questions: [{ id, text, paperId, paperName, year? }] }] }`, clusters ordered by how many papers they appear in. No past papers → empty arrays (not an error) |
| GET | `/api/materials/:id/questions` | Teacher. How a past paper was split: `{ materialId, name, questions: string[] }`. `409 NOT_A_PAST_PAPER` for outlines |
| PUT | `/api/materials/:id/questions` | Teacher. `{ questions: string[] }` replaces the split (1–200 questions, each non-empty, ≤ 2,000 chars; `400 INVALID_QUESTIONS`). Clusters recompute. Editing the paper's text, or re-extracting it, re-splits from scratch |

### Topic coverage and web research

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/subjects/:id/topics` | Teacher. How well the teacher's own material covers each topic: `[{ name, weight, thin, passages }]`. `thin` is the server's judgement that there is too little material to write good questions from; `passages` is how many it found. `[]` until something is uploaded. The rules screen uses it for topic suggestions and the "thin on …" hint |

With `webResearch: true`, `POST /api/tests/generate` (and `/regenerate`, which reuses the saved rules) may give questions on **thin** topics a web source. Every question carries `sources: [{ kind: "material"\|"web", label, snippet, url?, retrievedAt? }]` (teacher-only; stripped from everything students receive). `material` = a passage from the teacher's own uploads; `web` = a fetched page, always labelled as such and added alongside, never instead of, the material source. The returned test also has `research: { enabled, thinTopics: string[], webQuestions: number }` — `thinTopics` is reported even when web research is off, so the UI can nudge.

## Question bank

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/subjects/:id/bank` | Teacher. `?topic=` / `?source=` optional. `[{ id, subjectId, text, topic, type, marks, options, correctIndex, expectedAnswer, rubric, source: "past-paper"\|"generated"\|"manual", used, lastUsed (ms or null), createdAt, updatedAt }]` |
| POST | `/api/subjects/:id/bank` | Teacher. Add by hand: `{ type, topic, marks, text, options?, correctIndex?, expectedAnswer?, rubric? }` → question with `source: "manual"`, `used: 0`. `400 INVALID_QUESTION` (no topic/text, marks not a whole number 1–100, choice question without all options filled and a correct one, unknown type) |
| PUT | `/api/bank/:id` | Teacher. Replaces the content (same validation); `source`, `used` unchanged. `404` |
| DELETE | `/api/bank/:id` | Teacher. Tests that used it keep their own copy |

The bank also fills itself: `POST /api/tests/:id/publish` saves the test's questions — new ones as `source: "generated"`, `used: 1`; a question that came from the bank (`bankId`) or has the same text as one (case/whitespace-insensitive) bumps that entry's `used` and `lastUsed` instead of duplicating it. Personalized tests are de-duplicated across their variants. The publish response (and the test afterwards) carries `bankSummary: { added, reused }`.

## Personalized generation progress

A personalized-mode `POST /api/tests/generate` (and `/regenerate`) answers straight away with the draft and `generation: { status: "running", done, total, etaSeconds, currentStudent }`; the server then writes one test per student in the background. While it runs, `variants` holds only the finished ones. Class-mode tests have no `generation` field and are complete immediately; so are older drafts.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/tests/:id/generation` | Teacher. `{ status: "running"\|"done", done, total, etaSeconds?, currentStudent? }` — a light call to poll (the app does so once a second, only while running). Tests that aren't being generated answer `{ status: "done" }` |

While `running`, `409 GENERATION_IN_PROGRESS` is returned for: editing `variants`/`questionSet`, `POST /regenerate`, and `POST /publish` (renaming and other settings still work). When `done`, `GET /api/tests` returns every variant. Students never receive `generation`.

## Anti-cheat events

`POST /api/tests/:id/flag` — student, body `{ type }`; `type` must be one of the ten below (`400 INVALID_FLAG` otherwise). Stored on the attempt as `flags: [{ type, at }]`, in order, and returned to the teacher (live roster, results) and to the student's own review. Ignored once the attempt is submitted. All flag types count toward the per-student "flagged events" numbers.

| `type` | Reported when |
|---|---|
| `tab-switch` | the tab/window becomes hidden |
| `window-blur` | focus leaves the window while it is still visible (another window, devtools); not reported when it is part of a tab switch |
| `fullscreen-exit` | the student leaves fullscreen by any route — Esc, the page's own button, or the browser's F11 / green button (only when the test requires it) |
| `fullscreen-denied` | the test requires fullscreen but the page isn't in it at the start (blocked or unsupported) |
| `right-click`, `copy`, `cut`, `paste` | attempted on the test page (only when copy/paste blocking is on); the action is cancelled |
| `page-leave-attempt` | reload, close or back — the browser shows its "leave site?" prompt |
| `devtools-shortcut` | a developer-tools or view-source shortcut was pressed (F12, Ctrl+Shift+I/J/C/K, Cmd+Opt+I/J/U, Cmd+Shift+C, Ctrl+U). Logged only — never blocked, and a clue rather than proof: DevTools can also be opened from the browser menu |

Per-test switches live in `test.settings`, chosen in the publish dialog and sent to students with the test (the page obeys them and lists the active rules on the intro screen): `requireFullscreen` (default true), `blockCopyPaste` (default true), `shuffleQuestions` (default false) and `shuffleOptions` (default false). `POST /api/tests/:id/publish` validates `settings` before changing anything: only the known keys (`release` "immediately"\|"after_close", `aiGrading`, `allowBack`, `requireFullscreen`, `blockCopyPaste`, `shuffleQuestions`, `shuffleOptions` — booleans except `release`), otherwise `400 INVALID_SETTINGS`. Tab switches, window blur, page-leave and developer-tool shortcuts are always recorded; students are told so before they begin. The app throttles repeats of one type to one per 0.8 s.

## Tests

| Method | Endpoint | Purpose | In guide §8 |
|---|---|---|---|
| POST | `/api/tests/generate` | Generate and save a draft. Body: `{ subjectId, title?, mix, targetMarks, duration, mode, difficulty, focusTopics, instruction, webResearch?, bankQuestionIds? }` (`webResearch` boolean, default false; `400 INVALID_INPUT` otherwise). `bankQuestionIds` = question-bank ids (same subject, else `400 INVALID_BANK_IDS`): they are copied to the front of the draft (new ids, `bankId` set, a `bank` source) and count toward their type in `mix`, so only the remainder is generated; `mix` may be all zeros when ids are given. The server takes class and subject name from `subjectId`. `400 SUBJECT_REQUIRED`, `404` if the teacher has no such subject | yes |
| PUT | `/api/tests/:id` | Edit a draft. Body: `{ questionSet? , variants? }` (debounce on the client) | yes |
| POST | `/api/tests/:id/regenerate` | Rebuild questions from the stored rules | proposed |
| POST | `/api/tests/:id/duplicate` | Copy as a new draft | proposed |
| DELETE | `/api/tests/:id` | Remove a test (and its attempts) | proposed |
| POST | `/api/tests/:id/publish` | Body: `{ availableFrom?, availableUntil?, settings? }`. `settings` = any of `{ release, aiGrading, allowBack, requireFullscreen, blockCopyPaste, shuffleQuestions, shuffleOptions }` (see Anti-cheat events). 400 if any question fails validation | yes |
| POST | `/api/tests/:id/start-now` | Open a scheduled test immediately | proposed |
| POST | `/api/tests/:id/stop-now` | Close for all students | yes |
| GET | `/api/tests` (teacher) | Each **live** test also carries `progress: { started, submitted, expected }` (`expected` = class roster size, or number of variants for per-student tests) so the list can show "18 of 28 submitted" | proposed |
| POST | `/api/tests/:id/extend` | Body `{ minutes }`. Adds time to the window close and to every in-progress attempt's `deadline`; 409 if the test already ended. Returns `{ closesAt }` | proposed |
| GET | `/api/tests/:id/live-status` | `{ stopped, closesAt?, deadline? }`, polled every 20 s by a student taking the test. `deadline` is that student's own (so an extension reaches an open test) | yes |

**Variant document** (personalized tests, `variants[]`): `{ studentName, weakTopic: string|null, weakSource: "student"|"class"|null, weakAccuracy: number|null, questions[] }`. The server picks `weakTopic` when it generates (`weakTopicMap` in `lib/analytics.js`, ported to `domain/analytics.js`): a student with graded history gets their own lowest topic if it is under the 75% target; a student with no graded history inherits the class's weakest topic if under target (`weakSource: "class"`); otherwise `null`. About a quarter of the variant's questions are on that topic. Variants are built for the students of the subject's class only.

Test document: `{ id, title, subject, classId, cls, status: "draft"|"published",
mode: "class"|"personal", config, questionSet | null, variants | null,
schedule: { availableFrom, availableUntil } | null, publishedAt, stoppedAt,
regeneratedAt, settings, createdAt, updatedAt }`. The client derives
`scheduled | live | completed` from `schedule` and `stoppedAt`; the backend
should apply the same rule when enforcing access. `release: "immediately"`
shows a student their marks as soon as they submit; `"after_close"` waits until
the test has ended. `aiGrading: false` routes every written answer to the
teacher's manual queue. `allowBack: false` = one question at a time, no way back.

Question: `{ id, type: "mcq"|"truefalse"|"short"|"long"|"numerical", topic,
marks, text, options|null, correctIndex|null, expectedAnswer, rubric:
[{ label, points }] }`.

## Attempts

| Method | Endpoint | Purpose | In guide §8 |
|---|---|---|---|
| GET | `/api/tests/:id/start` | Start or resume the student's attempt; returns it with `questions` (own variant in personalized mode; **in this attempt's own order** when `shuffleQuestions`/`shuffleOptions` are on — see below). 409 `NOT_OPEN` / 403 `NO_VARIANT` | yes |
| PUT | `/api/attempts/:id/answers` | Best-effort backup of one answer: `{ questionId, value }`. Ignored after submit | proposed |
| POST | `/api/tests/:id/flag` | Anti-cheat event `{ type }`, e.g. `"tab-switch"`; server timestamps it | yes |
| POST | `/api/tests/:id/submit` | `{ reason: "manual"\|"timeout"\|"stopped", answers }`. **The full answer map is sent**, so submit never depends on earlier saves. Idempotent. Grades immediately (see Grading) | yes |

Attempt: `{ id, testId, student, variantIndex|null, startedAt, deadline,
status: "in_progress"|"submitted", submittedAt, submitReason, questions,
answers: { [questionId]: number|string }, flags: [{ type, at }] }`. `deadline` =
`min(start + duration, availableUntil)`, fixed at start. The server should also
auto-submit attempts past `deadline` or whose test was stopped (the mock does
this client-side in `settleExpired`; in real mode that function does nothing).

**Client silent (F7.4).** The server stamps `attempt.lastSeenAt` whenever the student's page talks to it (start/resume, `live-status`, answer save, flag). `clientSilent` is true when the attempt is `in_progress`, the test is live, and `now − lastSeenAt` exceeds 60 s (three missed 20 s pings). It is a clue only (closed lid, dropped connection), never an integrity finding; the page says so. `lastSeenAt` falls back to `submittedAt` / `startedAt`. The 60 s threshold is server-owned.

**Randomization (F7.3).** Decided by the server when the attempt is created, from the test's `settings`, and then frozen: resuming returns the same order. The attempt snapshot is stored already permuted — questions in the student's order, a multiple-choice question's `options` in the student's order, `correctIndex` remapped to match — so answers (option **indices into the options the student saw**), grading and `GET /attempts/:id/review` need no mapping and review lists questions in the order the student saw. The server also stores `attempt.shuffle = { questions: [originalId…], options: { [questionId]: [originalOptionIndex per shown position] } }` (null when nothing was shuffled) so teacher results/analytics can map back to the bank question; it is never sent to students. Rules (reference: `src/lib/randomize.js`, seeded Fisher–Yates, seed = attempt id): only `mcq` options move (true/false keeps True, False); options starting "All/None/Both of the above|these" stay last; question `id`s never change. The intro screen lists the active rule.

## Grading

A grade, per question of a submitted attempt:
`{ marks, max, status: "final"|"ai_draft"|"pending", source: "auto"|"ai"|"teacher",
confidence: 0–1|null, rubric: [{ label, points, awarded }]|null, feedback, aiMarks? }`.

- Objective questions: `final`, `source: "auto"` at submit.
- Written, AI grading on: `ai_draft` with `marks`, `confidence`, `rubric`,
  `feedback` from the model (`aiMarks` keeps the original suggestion).
- Written, AI grading off: `pending`, `marks: null`.
- Students only ever see `final` marks, so an unreviewed AI mark can't leak.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/grading/queue` | Queue items (below), one per written answer on the teacher's tests |
| PATCH | `/api/grades/:attemptId/:questionId` | `{ marks, feedback?, final, reason? }`. **`reason` (≤500 chars) is required (`400 REASON_REQUIRED`) when `marks` changes and either the move away from the AI mark is ≥25% of the question's marks, or the grade was already `final` and its result is released.** A first manual mark, an unchanged mark and a feedback-only edit never need one. Every outcome is written to the audit log (see "Audit log"). `final: true` accepts/overrides (becomes `final`, `source: "teacher"` if the mark differs from `aiMarks`); `false` saves a draft. 400 `INVALID_MARKS` outside `0..max` |
| POST | `/api/grading/approve` | `{ items: [{ attemptId, questionId }] }` — accept AI marks unchanged. Only `ai_draft` grades change. Returns `{ approved }` |

Queue item: `{ id, attemptId, questionId, testId, student, roll, test, date,
question, topic, answer, modelAnswer, maxScore, score, aiScore|null,
confidence: "low"|"med"|"high"|null, status: "pending"|"reviewed",
manual: boolean, source, rubric, feedback, flags, released: boolean }`
(`released`: the student can already see this result, so changing the mark needs a reason). Confidence buckets:
`<0.6` low, `<0.8` med, otherwise high.

Review (student): `GET /api/attempts/:id/review` →
`{ attemptId, test: { title, subject, cls }, submittedAt, submitReason, flags,
totals: { earned, max, complete, notFinal },
items: [{ question: { id, type, topic, marks, text, options },
answer, correctIndex|null, modelAnswer, grade }] }`.
`grade` is `{ status: "final", marks, max, feedback }` once final, otherwise
just `{ status: "grading", max }` — no marks. `totals` counts final marks only.

---

---

Older stage-by-stage notes live in `docs/archive/API-CONTRACT-history.md` (not current).

## Audit log (F11)

Every write that can change who sees what, or a mark, appends an event to an
append-only, hash-chained log. Events are **never** part of student or teacher
payloads, and nothing here can edit or delete one.

`AuditEvent = { _id, seq, at (ISO), actor: { id|null, role, name }, type, entity: { type, id }, classId|null, testId|null, studentId|null, before|null, after|null, meta, prevHash, hash }`
with `hash = SHA-256(prevHash + "\n" + canonicalJson(event without _id, prevHash, hash))`
and `prevHash` of event 1 = 64 zeros. Types and what each stores:
`docs/specs/F11-F13-audit-reports-profiles.md` §2.

Rules the server must keep (the fake server's `src/mocks/auditHooks.js` is the reference):
- One event per successful write, written in the same request; a request that fails writes none (except `auth.login_failed`). F13: `profile.update` (field names), `auth.password_changed`, `auth.password_reset`, `institution.update`, `profile.photo_set`, `profile.photo_removed` — never values or image data.
- The grading trail **is** the log: a mark's history is the events whose `entity` is `{ type: "grade", id: "<attemptId>:<questionId>" }`. Grades carry no history field.
- Drafts autosave through `PUT /tests/:id`, so only edits to a published test are logged (`test.update`).
- Never log passwords, tokens, answer keys or answer text. `attempt.submit` stores a digest of the answers instead.

### Reading the audit log (admin only; others get 403)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/audit/tests` | Published tests with trail counts: `[{ testId, title, subject, cls, teacher, status, attempts, answers, changed, overridden, afterRelease, pending }]`, newest first. Drafts never appear |
| GET | `/api/audit/tests/:testId?limit=&cursor=` | `{ test: { id, title, subject, cls, teacher, status, publishedAt, settings }, totals: { answers, changed, overridden, afterRelease, pending }, rows, nextCursor }`. `limit` 1..500 (default 200); `cursor` is the offset returned as `nextCursor` (`null` on the last page). **The first page (no cursor) writes an `audit.view` event** |

| Method | Path | Notes |
|---|---|---|
| GET | `/api/audit/teachers` | Every teacher: `[{ teacherId, name, email, classes: ["11A"…], reviewed, overrides, overrideRate, upward, downward, signals: { high, medium, low } }]`. A teacher who has marked nothing shows zeros |
| GET | `/api/audit/teachers/:teacherId` | `{ teacher: { id, name, email, classes }, stats: { reviewed, overrides, overrideRate, upward, downward, avgDelta, afterRelease }, peerMedianRate \| null, signals, students: [{ id, name, upward, downward }] (top 10), tests: [{ testId, title, reviewed, overrides }] }`. `404` for an unknown id or a non-teacher. **Writes an `audit.view` event** |

**Signals** (`lib/auditSignals.js`; computed from the events only; clues, not proof): `{ id, code, label, severity: "high"|"medium"|"low", text, evidence: [event seq…], studentId?, testId? }`. Codes and thresholds (exported as `SIGNAL_THRESHOLDS`): `OVERRIDE_RATE_HIGH` (≥5 reviewed, change rate ≥ 2× the other teachers' median and ≥ 25%; not computed without peers), `OVERRIDE_DIRECTION_BIAS` (≥5 changes, ≥80% one way), `STUDENT_FAVOURITISM` (≥3 increases for one student and ≥40% of that teacher's increases), `OVERRIDE_AGAINST_CONFIDENT_AI` (AI confidence ≥0.85 and a move of ≥25% of the marks), `AFTER_RELEASE_CHANGE` (high), `EDIT_AFTER_ATTEMPTS` (high; questions/settings of a published test edited after students started), `BULK_APPROVE_LARGE` (low; ≥20 marks in one batch). "Reviewed" = distinct answers approved, marked or changed; direction is judged per change (after − before).

**Teacher scoping (fixed in F11c):** `GET /api/grading/queue`, `PATCH /api/grades/…` and `POST /api/grading/approve` only touch attempts of tests in the signed-in teacher's own classes (others: not listed / `404` / skipped).

Row (one per *written* answer of a submitted attempt; auto-marked choice answers are not listed):
`{ id, attemptId, questionId, student: { id, name }, questionText, topic, max, studentAnswer, ai: { marks, confidence: "low"|"med"|"high"|null, feedback, model } | null, final: { marks, status, byName, at }, delta, changed, overridden, afterRelease, pending, history: [{ seq, at, type, actorName, actorRole, beforeMarks, afterMarks, status, reason, afterRelease }] }`.
`ai` is `null` when AI grading was off. `delta` = final − AI mark, only once the mark is final. `final.byName` is the last teacher action (`grade.override|approve|manual|feedback`). Rows are sorted by student name, then question order. Hash-chain fields (`prevHash`, `hash`) are never sent here.

### Event log, integrity and "my history" (F11d)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/audit/events` | Admin only. Filters (all optional): `actor` (user id or `system`), `group` (`grading|tests|attempts|accounts|access|reports`), `type`, `entityType`, `classId`, `testId`, `studentId`, `from`, `to` (ISO timestamps, inclusive). `limit` 1..500 (default 50); `cursor` = the `seq` of the last event seen (next page = events with a smaller `seq`). → `{ events (newest first, with hashes), nextCursor|null, total, names: { users, tests } (for the ids in this page), facets: { actors: [{ id, name, role }] } }` |
| GET | `/api/audit/integrity` | Admin only. `{ ok: true, checked, total, lastSeq, headHash, verifiedAt }` or `{ ok: false, badSeq, reason: "seq"\|"prev"\|"hash", total, lastSeq, headHash, verifiedAt }` (first failure only). Does not write an event |
| POST | `/api/audit/export-log` | Admin only. `{ rows }` (whole number ≥ 0) → 204. Writes `audit.export` so exports are on record. `400 INVALID_INPUT` otherwise |
| GET | `/api/audit/mine` | **Teacher only**, own events only. `?limit=&cursor=` → `{ totals: { reviewed, overrides, overrideRate, upward, downward, afterRelease }, items: [{ seq, at, type, label, testId, testTitle, studentName, beforeMarks, afterMarks, max, reason, afterRelease, bulk }], nextCursor|null }` (the teacher's `grade.*` and `test.*` events; no hashes, no signals, no peer data) |

## Analytics
Computed by the server from graded attempts (reference: `src/lib/analytics.js`, ported unchanged to `server/src/domain/analytics.js`). The client only draws it.

`GET /api/analytics/me` (student only, 403 otherwise) → `{ student: { name, roll, cls }, trend, topics, summary }`
- `trend`: `[{ t: "T1"…, testId, label, at, you, class }]`, oldest first. `you` / `class` are whole percents; `class` = mean % of classmates' complete attempts at that test.
- `topics`: `[{ name, accuracy, trend[] }]`, best first. `accuracy` = marks earned / marks available on that topic's questions over the counted tests; `trend` = that topic's % per counted test.
- `summary`: `{ tests, awaiting, average, latest, classLatest, changeSinceFirst, aheadOfClass, testsAhead, startedAhead, strongest, weakest }` (`strongest`/`weakest` are topic rows or null).

Rules: (1) only submitted attempts whose marks are **all final** count; ones still waiting for the teacher are reported as `awaiting`. (2) A test counts for the student only once its results are released to them (same rule as `GET /attempts`: `release: "immediately"` or the test has ended). (3) Other students appear only inside `class` averages, never by name or mark. (4) No counted test → `trend: []`, `summary.tests: 0`, not an error. The cache key `["analytics"]` is refreshed after submit and after grading writes.

**Teacher endpoints** (teacher only, 403 otherwise; `classId` must be one of the teacher's classes and `subjectId` one of its subjects, else 404). Unlike the student view nothing is filtered by release: the teacher sees everything fully graded.
- `GET /api/analytics/class?classId=&subjectId=` → `{ cls: { id, name, code }, subject: { id, name }, trend, topics, students, summary }`
  - `trend`: `[{ t, testId, label, at, class, spread, students }]` oldest first (`class` = mean %, `spread` = population σ of the percents, `students` = how many attempts counted).
  - `topics`: `[{ name, accuracy, affected, trend[] }]` best first; `affected` = students whose own accuracy on that topic is under `target`.
  - `students`: `[{ id, name, roll, tests, overall, weak, weakAccuracy, strong, strongAccuracy, flags }]` sorted by `overall` desc (`overall` = mean of that student's per-test %, `null` before any counted test; `weak`/`strong` = lowest/highest topic, `null` with fewer than two topics; `flags` = all anti-cheat events on their attempts at these tests).
  - `summary`: `{ tests, awaiting, classAverage, changeSinceFirst, spread, belowTarget[] (weakest first), topicsTotal, studentsAtRisk (overall < target), studentsTotal, target }`; `target` is 75.
- `GET /api/analytics/students/:id?classId=&subjectId=` → `{ student: { id, name, roll, cls }, subject, trend, topics, summary, recent }`: the same shape as `/analytics/me`, plus `recent: [{ id, testId, test, at, earned, max, percent|null, flags }]` (every submitted attempt, newest first; `percent: null` = still being marked).
- `GET /api/analytics/students/:id/history?subject=&from=&to=` (teacher only; reference `src/lib/studentHistory.js`, ported to `server/src/domain/studentHistory.js`) → `{ student: { id, name, roll, cls }, subjects: [{ id, name }], rows, summary }`. The student must be in one of the teacher's classes (else `404`). Every subject of that class is covered and nothing is filtered by release. `subject` = a subject id; `from`/`to` = ISO timestamps, inclusive, either optional; an unparseable value or `from` after `to` is `400 INVALID_FILTER`; a subject id that has no tests (or is another class's) just gives no rows.
  - `rows` (newest first, one per submitted attempt): `{ id, testId, test, subjectId, subject, at, status: "final"|"pending", marks|null, max, percent|null, classAverage|null, timeTakenSec|null, submitReason|null, flags: { high, medium, low } }`. `pending` = some mark is not final yet: `marks`/`percent` are null and the row is left out of every average. `classAverage` = mean % of all complete attempts at that test (null if none). `flags` = anti-cheat events counted by severity (`FLAG_TYPES`; unknown types count as `low`).
  - `summary` (over the filtered rows): `{ count, final, pending, average|null, best|null, lowest|null, trend: "up"|"down"|"steady"|null, flags }`. `trend` = mean of the latest two final tests vs the mean of the earlier ones; `null` with fewer than 3 final tests; a move under 5 points is `steady`.
- `GET /api/analytics/class` students also carry `lastTest: { testId, title, at, percent }|null`, `trend` (same rule), and `belowTarget` (how many of the student's topics are under `target`).
- Pending reviews on the teacher dashboard come from `GET /grading/queue`, not from analytics.

## Reports (F12b)

Teacher only (`403` otherwise). A report holds **confirmed marks only**: final grades of tests already **released to the student**. Pending or unreleased tests never enter a number (the page tells the teacher how many were left out). No anti-cheat events, no other student's name or marks (class averages only) and no question text ever appear. Rules and the builder live in `src/lib/report.js` (pure; the server ports it). The sheet is made in the browser and saved as a PDF with the print dialog; the server keeps a snapshot, never the text.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/reports/data?studentId=&preset=weekly&period=&from=&to=&subjectId=` | `from`/`to` are ISO timestamps the **client** resolves in the teacher's time zone (the server never guesses a zone; weeks start Monday). `period` is only a label key (`thisWeek`, `last7`, `thisMonth`, `custom`). Or `?studentId=&preset=test&testId=&subjectId=`. → `{ student: { id, name, roll, cls }, subjects: [{ id, name }], subjectName, rows, topics: [{ name, accuracy }], questions, excluded: { pending, unreleased } }`. `rows` = released, final history rows (F12a shape without `flags`, `timeTakenSec`, `submitReason`) up to the end of the period, so the trend can use earlier tests; `topics` = accuracy over the period (or that one test); `questions` (test only) = `[{ no, topic, marks, max, feedback }]`. Errors: `404` student not in the teacher's classes / unknown subject or test, `400 INVALID_REPORT` (unknown preset, missing or backwards dates), `409 NOT_READY` (a test report for a result that is not final or not released) |
| POST | `/api/reports` | `{ studentId, preset, period, from, to, testId?, subjectId?, options: { sections: { summary, trend, topics, tests, comment, nextSteps }, comment, language: "en"|"ur"|"both" (default en; anything else counts as en) } }` → `{ id, generatedAt, contentHash }`. The server rebuilds the report with the same `buildReport` and stores a snapshot `{ id, studentId, createdBy, createdAt, preset, period, testId, contentHash }`. **The comment is used for the hash and then dropped.** `contentHash` = SHA-256 of the canonical JSON of what is printed, including the language (not the letterhead, print time or the teacher's counts); the sheet footer shows `report <id> · code <first 8 hex>` only while the on-screen hash still equals the saved one. Writes `report.generate` with `meta { preset, studentId }` (never marks or text) |
| POST | `/api/reports/batch` | F12d. `{ studentIds (1–60, repeats count once), preset, period, from, to, testId?, subjectId?, options: { language } }` → `{ reports: [{ studentId, reportId, generatedAt }], skipped: [{ studentId, reason: "no_marks" \| "not_ready" }] }`. One snapshot and one `report.generate` (`meta { preset, studentId, batch: true }`) per student in `reports`; the snapshot uses every section and no comment. **All-or-nothing on access**: any student outside the teacher's classes → `404` and nothing is made. `400 INVALID_REPORT` for nobody, more than 60 or an unknown type. A student with no confirmed marks in the period (`no_marks`) or no final released result for that test (`not_ready`) is skipped, not an error. Teacher only (`403` otherwise) |
| POST | `/api/reports/:id/exported` | `{ channel: "pdf" \| "whatsapp" \| "copy" }` → `{ id, channel }`. Only the teacher who made it (`404` otherwise); `400 INVALID_CHANNEL`. Writes `report.export` with `meta { channel }`. For `pdf` it means "the print dialog was opened" |

## Parent contact (F12c1)

A student may have a parent or guardian name and a WhatsApp number. Only an **admin** or the **teacher of the student's class** can read or change it (`404` for any other teacher, `403` for a student, even for their own record). **The number and name appear in no other payload**: not in `/users`, rosters, `/profile`, analytics, history, reports or audit events. Rules live in `src/lib/contact.js` (pure; the server ports it): only Pakistani mobile numbers (`3[0-5]` + 8 digits) are accepted, in any usual format (`0300-1234567`, `+92 300 1234567`, `0092…`, `923001234567`), and stored as `923001234567`. Deleting the account deletes the contact.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/students/:id/guardian` | → `{ name, phone, masked }` (`""` when none; `masked` = `+92 300 ••• 4567`). The UI shows `masked` and puts `phone` only inside the edit form |
| PUT | `/api/students/:id/guardian` | `{ name?, phone? }`: only the keys sent change, `""` removes. Name is trimmed, spaces collapsed, ≤ 80 characters, no `<` `>` or control characters. → the same shape. `400 INVALID_GUARDIAN` (unknown field, bad number, name too long), nothing changes. Writes `guardian.update` with `meta { changed: ["name"\|"phone"] }` (field names only, never the values) and only when something changed. `POST /api/users` for a student with a contact writes `user.create` then `guardian.update` |

## Courses & lessons
A **course** belongs to a subject (`{ id, subjectId, title }`); a subject can have several. A **lesson** belongs to a course: `{ id, courseId, order, kind: "text"|"video"|"file", title, duration, body, url, testId|null }`. A student's progress is one row per finished lesson (`{ lessonId, student, doneAt }`).

**Teacher view** (`GET /courses?subjectId=`; 404 for a subject that isn't theirs): `[{ id, subjectId, subject, title, students, lessons: [{ …lesson, doneCount }] }]`, lessons in `order`. Every write returns the updated course in this shape.
**Student view** (`GET /courses`, their class's subjects): `[{ id, subject, title, lessons: [{ id, order, kind, title, duration, body, url, done, test: { id, title, status }|null }], progress: { done, total, percent } }]`. No `doneCount`, no `testId`, nothing about other students. `test` is present only when the linked test is not a draft (`scheduled | live | completed`); the UI shows "Take the test" while it is `live`.

Rules (reference `src/lib/lms.js`, ported to `server/src/domain/lms.js`):
- Lesson: `text` needs `body`; `video`/`file` need an **http(s)** `url` (anything else, e.g. `javascript:`, is `400 INVALID_LESSON`, because the URL ends up in `href`/`src`); title 1–140 chars; body ≤ 20 000; `duration` ≤ 40 chars; `text` lessons keep no `url`; unknown fields are dropped.
- `testId` must be a non-draft test of the **same subject**, else `400 INVALID_TEST`. Deleting a test sets `testId: null` on lessons that pointed at it.
- Order: new lessons append; `PUT …/lessons/order` must list every lesson exactly once, else `400 INVALID_ORDER`; deleting a lesson renumbers the rest `0…n-1`.
- Deleting a course removes its lessons and all progress on them. A subject with courses can't be deleted (`409 SUBJECT_IN_USE`, same as with tests).
- Progress: `PUT /lessons/:id/progress { done }` is idempotent; a student can only touch lessons of their own class (404 otherwise); `done` must be a boolean (400).
- Cache keys `["courses"]` are refreshed after every write.

## Class discussion
One discussion per class. **Thread:** `{ id, classId, title, body, author, authorId, role: "teacher"|"student", tag: "Question"|"Discussion"|"Resource"|"Announcement", pinned, resolved, createdAt, lastActivityAt, replies: [{ id, author, authorId, role, body, createdAt }] }` (replies oldest first). Author, role and times are set by the server from the signed-in account and the clock; the client sends none of them. The UI turns `createdAt` into "2 hours ago" (`timeAgo` in `src/lib/discussion.js`) and sorts pinned first, then by `lastActivityAt` (`sortThreads`).

- `GET /api/threads` → threads of the caller's class. Teacher: `?classId=` required and must be one of theirs (404 otherwise). Student: their own class, any `classId` is ignored. Admins get 403.
- `POST /api/threads` `{ classId? (teacher), title, body, tag }` → thread. Title 1–140 chars, body 1–5000 (both trimmed), `tag` one of the four; only teachers may use `Announcement`. `400 INVALID_THREAD` with the message the form shows.
- `POST /api/threads/:id/replies` `{ body }` (1–3000, trimmed) → thread; bumps `lastActivityAt`. `400 INVALID_REPLY`.
- `PUT /api/threads/:id` `{ pinned?, resolved? }` → thread. `pinned`: teachers only. `resolved`: any teacher or the thread's author (`canResolve`). Both must be booleans (400). 403 otherwise.
- `DELETE /api/threads/:id` (teacher) and `DELETE /api/threads/:id/replies/:replyId` (teacher; returns the thread). 404 for unknown ids or threads of another class.
- Cache keys `["threads"]` are refreshed after every write and polled every 30 s. Nothing is deleted when an author's account is removed (the name stays as a snapshot).

