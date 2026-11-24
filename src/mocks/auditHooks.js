import { canonicalJson } from "@/lib/audit";
import { INSTITUTION_DEFAULTS, institutionChangedFields } from "@/lib/institution";
import { guardianChanged } from "@/lib/contact";
import { effectivePolicy, privacyChangedFields } from "@/lib/privacy";
import { sha256Hex } from "@/lib/sha256";
import { db, save } from "./db";
import { isReleased } from "./engine";
import { MOCK_GRADER_MODEL, SYSTEM_ACTOR, actorOf, record } from "./audit";

// ═══════════════════════════════════════════════════════════════
// Where the fake server writes audit events (spec §2 type table).
// Handlers stay unaware of auditing: withAudit() wraps the routes named in
// HOOKS. `pre` sees the state before the handler runs, `after` sees the result
// and returns one event (or several, or none). A handler that throws logs
// nothing, except a failed sign-in (`onError`).
// ═══════════════════════════════════════════════════════════════
const testOf = (id) => db().tests.find((t) => t.id === id) ?? null;
const attemptOf = (id) => db().attempts.find((a) => a.id === id) ?? null;
const studentIdOf = (name) => db().users.find((u) => u.role === "student" && u.name === name)?.id ?? null;
const pick = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj?.[k] ?? null]));
const diff = (before, after) => {
  const keys = Object.keys(after).filter((k) => canonicalJson(before[k]) !== canonicalJson(after[k]));
  return keys.length
    ? { before: Object.fromEntries(keys.map((k) => [k, before[k] ?? null])), after: Object.fromEntries(keys.map((k) => [k, after[k] ?? null])) }
    : null;
};
const profileFields = (u) => ({ bio: u?.bio ?? "", phone: u?.phone ?? "", prefs: u?.prefs ?? {} });
const testRefs = (test) => ({ classId: test?.classId ?? null, testId: test?.id ?? null });
const gradeEntity = (attemptId, questionId) => ({ type: "grade", id: `${attemptId}:${questionId}` });

const guardianOf = (u) => ({ name: u?.guardianName ?? "", phone: u?.guardianPhone ?? "" });
// field names only: never the parent's name or number
const guardianEvent = (user, studentId, before, after) => {
  const changed = guardianChanged(before, after);
  return changed.length
    ? { actor: actorOf(user), type: "guardian.update", entity: { type: "user", id: studentId }, studentId, classId: db().users.find((x) => x.id === studentId)?.classId ?? null, meta: { changed } }
    : null;
};

const HOOKS = {
  "POST /auth/login": {
    after: ({ result, body }) => ({
      actor: { id: result.user.id, role: result.user.role, name: result.user.name },
      type: "auth.login",
      entity: { type: "user", id: result.user.id },
      meta: { email: String(body?.email ?? result.user.email ?? "") },
      ...(result.user.role === "student" ? { studentId: result.user.id } : {}),
    }),
    onError: ({ body }, err) => ({
      actor: { id: null, role: null, name: String(body?.email ?? "").slice(0, 120) },
      type: "auth.login_failed",
      entity: { type: "user", id: null },
      meta: { email: String(body?.email ?? "").slice(0, 120), code: err?.code ?? err?.status ?? null },
    }),
  },

  "POST /auth/change-password": {
    after: ({ user }) => ({ actor: actorOf(user), type: "auth.password_changed", entity: { type: "user", id: user.id } }),
  },
  "POST /users/:id/reset-password": {
    after: ({ user, params }) => ({ actor: actorOf(user), type: "auth.password_reset", entity: { type: "user", id: params.id } }),
  },

  "POST /users": {
    after: ({ user, result, body }) => [
      {
        actor: actorOf(user),
        type: "user.create",
        entity: { type: "user", id: result.id },
        studentId: result.role === "student" ? result.id : null,
        after: { role: result.role, classId: body?.classId ?? null },
      },
      guardianEvent(user, result.id, { name: "", phone: "" }, guardianOf(db().users.find((x) => x.id === result.id))),
    ],
  },
  "PUT /users/:id": {
    pre: ({ params }) => {
      const u = db().users.find((x) => x.id === params.id);
      return u ? pick(u, ["active", "classId"]) : null;
    },
    after: ({ user, params, pre }) => {
      const u = db().users.find((x) => x.id === params.id);
      const d = pre && u ? diff(pre, pick(u, ["active", "classId"])) : null;
      return d && { actor: actorOf(user), type: "user.update", entity: { type: "user", id: params.id }, studentId: u.role === "student" ? u.id : null, ...d };
    },
  },
  "DELETE /users/:id": {
    pre: ({ params }) => {
      const u = db().users.find((x) => x.id === params.id);
      return u ? { role: u.role, name: u.name } : null;
    },
    after: ({ user, params, pre }) => ({ actor: actorOf(user), type: "user.delete", entity: { type: "user", id: params.id }, before: pre }),
  },

  "PATCH /profile": {
    // "" / {} are the defaults for a missing field, so saving an unchanged form logs nothing
    pre: ({ user }) => profileFields(db().users.find((x) => x.id === user.id)),
    after: ({ user, pre }) => {
      const now = profileFields(db().users.find((x) => x.id === user.id));
      const changed = Object.keys(now).filter((k) => canonicalJson(pre?.[k]) !== canonicalJson(now[k]));
      // field names only: never the bio, the phone number or the preferences themselves
      return changed.length ? { actor: actorOf(user), type: "profile.update", entity: { type: "user", id: user.id }, meta: { changed } } : null;
    },
  },

  "PUT /students/:id/guardian": {
    pre: ({ params }) => guardianOf(db().users.find((x) => x.id === params.id)),
    after: ({ user, params, pre }) => guardianEvent(user, params.id, pre, guardianOf(db().users.find((x) => x.id === params.id))),
  },

  "PUT /institution/privacy": {
    pre: () => ({ ...effectivePolicy(db().privacy ?? null) }),
    after: ({ user, pre }) => {
      const now = effectivePolicy(db().privacy ?? null);
      const changed = privacyChangedFields(pre, now);
      // field names and the version number only: never the policy text
      return changed.length ? { actor: actorOf(user), type: "privacy.update", entity: { type: "institution", id: "institution" }, meta: { changed, version: now.version } } : null;
    },
  },

  "PUT /institution": {
    pre: () => ({ ...INSTITUTION_DEFAULTS, ...(db().institution ?? {}) }),
    after: ({ user, pre }) => {
      const changed = institutionChangedFields(pre, { ...INSTITUTION_DEFAULTS, ...(db().institution ?? {}) });
      // field names only: never the institution's name, contact details or logo
      return changed.length ? { actor: actorOf(user), type: "institution.update", entity: { type: "institution", id: "institution" }, meta: { changed } } : null;
    },
  },

  "PUT /profile/photo": {
    after: ({ user }) => ({ actor: actorOf(user), type: "profile.photo_set", entity: { type: "user", id: user.id } }),
  },
  "DELETE /profile/photo": {
    pre: ({ user }) => ({ had: Boolean(db().users.find((x) => x.id === user.id)?.photo) }),
    after: ({ user, pre }) => (pre?.had ? { actor: actorOf(user), type: "profile.photo_removed", entity: { type: "user", id: user.id } } : null),
  },
  "DELETE /users/:id/photo": {
    pre: ({ params }) => ({ had: Boolean(db().users.find((x) => x.id === params.id)?.photo) }),
    after: ({ user, params, pre }) => (pre?.had ? { actor: actorOf(user), type: "profile.photo_removed", entity: { type: "user", id: params.id }, meta: { by: "admin" } } : null),
  },

  "POST /classes": {
    after: ({ user, result, body }) => ({ actor: actorOf(user), type: "class.create", entity: { type: "class", id: result.id }, classId: result.id, after: { name: String(body?.name ?? "").trim() } }),
  },
  "PUT /classes/:id": {
    pre: ({ params }) => {
      const c = db().classes.find((x) => x.id === params.id);
      return c ? { name: c.name, teacherIds: [...c.teacherIds] } : null;
    },
    after: ({ user, params, pre }) => {
      const c = db().classes.find((x) => x.id === params.id);
      const d = pre && c ? diff(pre, { name: c.name, teacherIds: c.teacherIds }) : null;
      return d && { actor: actorOf(user), type: "class.update", entity: { type: "class", id: params.id }, classId: params.id, ...d };
    },
  },
  "DELETE /classes/:id": {
    pre: ({ params }) => {
      const c = db().classes.find((x) => x.id === params.id);
      return c ? { name: c.name } : null;
    },
    after: ({ user, params, pre }) => ({ actor: actorOf(user), type: "class.delete", entity: { type: "class", id: params.id }, classId: params.id, before: pre }),
  },

  "POST /tests/generate": {
    after: ({ user, result }) => ({ actor: actorOf(user), type: "test.generate", entity: { type: "test", id: result.id }, ...testRefs(testOf(result.id)), meta: { mode: result.mode } }),
  },
  // Drafts autosave through this route, so only edits to a test that is already
  // published (scheduled) are logged; authoring drafts is not a grading matter.
  "PUT /tests/:id": {
    pre: ({ params }) => {
      const t = testOf(params.id);
      return t ? { status: t.status, attempts: db().attempts.some((a) => a.testId === t.id) } : null;
    },
    after: ({ user, params, body, pre }) => {
      if (!pre || pre.status === "draft") return null;
      const changed = [
        body?.title !== undefined && "title",
        (body?.questionSet !== undefined || body?.variants !== undefined) && "questions",
        body?.config !== undefined && "settings",
      ].filter(Boolean);
      return changed.length
        ? { actor: actorOf(user), type: "test.update", entity: { type: "test", id: params.id }, ...testRefs(testOf(params.id)), meta: { changed, afterAttempts: pre.attempts } }
        : null;
    },
  },
  "POST /tests/:id/regenerate": {
    after: ({ user, params }) => ({ actor: actorOf(user), type: "test.regenerate", entity: { type: "test", id: params.id }, ...testRefs(testOf(params.id)) }),
  },
  "POST /tests/:id/duplicate": {
    after: ({ user, params, result }) => ({ actor: actorOf(user), type: "test.duplicate", entity: { type: "test", id: result.id }, ...testRefs(testOf(result.id)), meta: { sourceId: params.id } }),
  },
  "DELETE /tests/:id": {
    pre: ({ params }) => {
      const t = testOf(params.id);
      if (!t) return null;
      const attempts = db().attempts.filter((a) => a.testId === t.id);
      return { title: t.title, status: t.status, classId: t.classId, attempts: attempts.length };
    },
    after: ({ user, params, pre }) => ({
      actor: actorOf(user),
      type: "test.delete",
      entity: { type: "test", id: params.id },
      classId: pre?.classId ?? null,
      testId: params.id,
      before: pre && { title: pre.title, status: pre.status },
      meta: { attempts: pre?.attempts ?? 0 },
    }),
  },
  "POST /tests/:id/publish": {
    after: ({ user, params }) => {
      const t = testOf(params.id);
      return {
        actor: actorOf(user),
        type: "test.publish",
        entity: { type: "test", id: params.id },
        ...testRefs(t),
        after: { settingsHash: sha256Hex(canonicalJson(t?.settings ?? {})) },
        meta: { scheduled: Boolean(t?.schedule) },
      };
    },
  },
  "POST /tests/:id/start-now": {
    after: ({ user, params }) => ({ actor: actorOf(user), type: "test.start_now", entity: { type: "test", id: params.id }, ...testRefs(testOf(params.id)) }),
  },
  "POST /tests/:id/stop-now": {
    after: ({ user, params }) => ({ actor: actorOf(user), type: "test.stop_now", entity: { type: "test", id: params.id }, ...testRefs(testOf(params.id)) }),
  },
  "POST /tests/:id/extend": {
    after: ({ user, params, body }) => ({ actor: actorOf(user), type: "test.extend", entity: { type: "test", id: params.id }, ...testRefs(testOf(params.id)), meta: { minutes: Number(body?.minutes) } }),
  },

  // The attempt is created on the student's first call; later calls resume it.
  "GET /tests/:id/start": {
    pre: ({ user, params }) => db().attempts.filter((a) => a.testId === params.id && a.student === user.name).length,
    after: ({ user, params, pre }) => {
      const mine = db().attempts.filter((a) => a.testId === params.id && a.student === user.name);
      if (mine.length <= pre) return null;
      return { actor: actorOf(user), type: "attempt.start", entity: { type: "attempt", id: mine[mine.length - 1].id }, ...testRefs(testOf(params.id)), studentId: user.id };
    },
  },

  // Reading a test's grading trail is itself recorded (not when paging, not the list).
  "GET /audit/tests/:testId": {
    after: ({ user, params, query }) =>
      query?.cursor
        ? null
        : { actor: actorOf(user), type: "audit.view", entity: { type: "audit", id: params.testId }, ...testRefs(testOf(params.testId)), meta: { what: "test-trail" } },
  },
  // Exporting the event log is itself recorded (how many rows left the system).
  "POST /audit/export-log": {
    after: ({ user, body }) => ({ actor: actorOf(user), type: "audit.export", entity: { type: "audit", id: "events" }, meta: { rows: Number(body?.rows) } }),
  },
  "GET /audit/teachers/:teacherId": {
    after: ({ user, params }) => ({ actor: actorOf(user), type: "audit.view", entity: { type: "audit", id: params.teacherId }, meta: { what: "teacher-profile" } }),
  },
  "PATCH /grades/:attemptId/:questionId": {
    pre: ({ params, now }) => {
      const a = attemptOf(params.attemptId);
      const g = a?.grades?.[params.questionId];
      if (!g) return null;
      const released = isReleased(testOf(a.testId), a, now);
      return { marks: g.marks, max: g.max, status: g.status, aiMarks: g.aiMarks ?? null, confidence: g.confidence ?? null, feedback: g.feedback ?? "", afterRelease: g.status === "final" && released };
    },
    after: ({ user, params, body, result, pre }) => {
      if (!pre) return null;
      const a = attemptOf(params.attemptId);
      const reason = String(body?.reason ?? "").trim();
      let type = null;
      if (pre.marks == null && pre.aiMarks == null) type = "grade.manual";
      else if (result.marks !== pre.marks) type = "grade.override";
      else if (pre.status !== "final" && result.status === "final") type = "grade.approve";
      else if ((result.feedback ?? "") !== pre.feedback) type = "grade.feedback";
      if (!type) return null;
      return {
        actor: actorOf(user),
        type,
        entity: gradeEntity(params.attemptId, params.questionId),
        ...testRefs(testOf(a.testId)),
        studentId: studentIdOf(a.student),
        before: { marks: pre.marks, status: pre.status },
        after: { marks: result.marks, status: result.status },
        meta: { reason: reason || null, afterRelease: pre.afterRelease, aiMarks: pre.aiMarks, confidence: pre.confidence, max: pre.max, final: result.status === "final" },
      };
    },
  },
  "POST /reports": {
    after: ({ user, result, body }) => ({
      actor: actorOf(user),
      type: "report.generate",
      entity: { type: "report", id: result.id },
      studentId: body.studentId,
      classId: db().users.find((u) => u.id === body.studentId)?.classId ?? null,
      meta: { preset: body.preset, studentId: body.studentId }, // never the comment, marks or contact details
    }),
  },
  "POST /reports/batch": {
    after: ({ user, result, body }) =>
      result.reports.map((r) => ({
        actor: actorOf(user),
        type: "report.generate",
        entity: { type: "report", id: r.reportId },
        studentId: r.studentId,
        classId: db().users.find((u) => u.id === r.studentId)?.classId ?? null,
        meta: { preset: body.preset, studentId: r.studentId, batch: true }, // never marks, text or contact details
      })),
  },
  "POST /reports/:id/exported": {
    after: ({ user, params, body }) => ({
      actor: actorOf(user),
      type: "report.export",
      entity: { type: "report", id: params.id },
      studentId: (db().reports ?? []).find((r) => r.id === params.id)?.studentId ?? null,
      meta: { channel: body.channel },
    }),
  },
  "POST /grading/approve": {
    pre: ({ body }) => {
      const wanted = new Set((body?.items ?? []).map((i) => `${i.attemptId}:${i.questionId}`));
      const hits = [];
      db().attempts.forEach((a) =>
        Object.entries(a.grades ?? {}).forEach(([qid, g]) => {
          if (g.status === "ai_draft" && wanted.has(`${a.id}:${qid}`)) hits.push({ attemptId: a.id, qid, marks: g.marks, max: g.max, aiMarks: g.aiMarks ?? null, confidence: g.confidence ?? null });
        }),
      );
      return hits;
    },
    after: ({ user, pre }) => {
      const batchId = `b-${Date.now().toString(36)}`;
      return pre
        .filter((h) => attemptOf(h.attemptId)?.grades?.[h.qid]?.status === "final") // the handler skips marks the teacher does not own
        .map((h) => {
        const a = attemptOf(h.attemptId);
        return {
          actor: actorOf(user),
          type: "grade.approve",
          entity: gradeEntity(h.attemptId, h.qid),
          ...testRefs(testOf(a.testId)),
          studentId: studentIdOf(a.student),
          before: { marks: h.marks, status: "ai_draft" },
          after: { marks: h.marks, status: "final" },
          meta: { bulk: pre.length > 1, batchId, aiMarks: h.aiMarks, confidence: h.confidence, max: h.max, afterRelease: false },
        };
      });
    },
  },
};

/** Wrap the route table so the routes in HOOKS write audit events. */
export const withAudit = (routes) =>
  routes.map((route) => {
    const hook = HOOKS[`${route.method} ${route.path}`];
    if (!hook) return route;
    return {
      ...route,
      handler: (ctx) => {
        const pre = hook.pre?.(ctx);
        let result;
        try {
          result = route.handler(ctx);
        } catch (err) {
          const failed = hook.onError?.(ctx, err);
          if (failed) {
            record(db(), failed, ctx.now ?? Date.now());
            save();
          }
          throw err;
        }
        const events = [hook.after?.({ ...ctx, pre, result })].flat().filter(Boolean);
        events.forEach((ev) => record(db(), ev, ctx.now ?? Date.now()));
        if (events.length) save();
        return result;
      },
    };
  });

/** Called by the fake server's submit(): one submit event plus one per AI-drafted mark. */
export const recordSubmission = (attempt, test, reason, answers, actor, now) => {
  const base = { ...testRefs(test), studentId: studentIdOf(attempt.student) };
  record(
    db(),
    {
      ...base,
      actor: actor ?? { ...SYSTEM_ACTOR },
      type: "attempt.submit",
      entity: { type: "attempt", id: attempt.id },
      meta: { reason, answerDigest: sha256Hex(canonicalJson(answers ?? {})) },
    },
    now,
  );
  Object.entries(attempt.grades ?? {}).forEach(([qid, g]) => {
    if (g.source !== "ai") return;
    record(
      db(),
      {
        ...base,
        actor: { ...SYSTEM_ACTOR },
        type: "grade.ai_draft",
        entity: gradeEntity(attempt.id, qid),
        after: { marks: g.marks, status: "ai_draft", confidence: g.confidence },
        meta: { model: MOCK_GRADER_MODEL, feedback: g.feedback ?? "" },
      },
      now,
    );
  });
};
