import { GENESIS, hashEvent } from "@/lib/audit";

// The fake server's audit log. `record` takes the state object explicitly (not
// db()) so the seed can use it before the DB exists. It never calls save():
// the handler that caused the event persists it with its own save().
export const SYSTEM_ACTOR = { id: null, role: "system", name: "System" };
export const MOCK_GRADER_MODEL = "mock-keyword-v1";

export const actorOf = (user) =>
  user ? { id: user.id ?? null, role: user.role ?? null, name: user.name ?? "" } : { ...SYSTEM_ACTOR };

const clone = (v) => (v === undefined || v === null ? null : JSON.parse(JSON.stringify(v)));

/** Append one event; returns it. `at` is a millisecond timestamp. */
export const record = (state, partial, at) => {
  const log = (state.auditLog ??= []);
  const seq = log.length + 1;
  const prevHash = log.length ? log[log.length - 1].hash : GENESIS;
  const body = {
    seq,
    at: new Date(at).toISOString(),
    actor: clone(partial.actor) ?? { ...SYSTEM_ACTOR },
    type: partial.type,
    entity: clone(partial.entity) ?? { type: null, id: null },
    classId: partial.classId ?? null,
    testId: partial.testId ?? null,
    studentId: partial.studentId ?? null,
    before: clone(partial.before),
    after: clone(partial.after),
    meta: clone(partial.meta) ?? {},
  };
  const event = { _id: `ev-${seq}`, ...body, prevHash, hash: hashEvent(prevHash, body) };
  log.push(event);
  return event;
};
