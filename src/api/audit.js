import { call } from "./client";

const EXPORT_CAP = 5000;

/** Query string from explorer filters; empty values are left out. */
export const eventsQuery = (filters = {}, extra = {}) => {
  const q = new URLSearchParams();
  Object.entries({ ...filters, ...extra }).forEach(([k, v]) => v !== "" && v != null && q.set(k, String(v)));
  return q.toString();
};

/**
 * Every event matching the filters, newest first, up to EXPORT_CAP (for the CSV).
 * Returns { events, names, truncated }.
 * Real endpoint: GET /api/audit/events paged with `cursor`.
 */
export const fetchAllAuditEvents = async (filters) => {
  let cursor = null;
  const events = [];
  const names = { users: {}, tests: {} };
  for (;;) {
    const page = await call(`/audit/events?${eventsQuery(filters, { limit: 200, ...(cursor ? { cursor } : {}) })}`);
    events.push(...page.events);
    Object.assign(names.users, page.names.users);
    Object.assign(names.tests, page.names.tests);
    cursor = page.nextCursor;
    if (!cursor) return { events, names, truncated: false };
    if (events.length >= EXPORT_CAP) return { events: events.slice(0, EXPORT_CAP), names, truncated: true };
  }
};

/** Tell the server how many rows were exported, so the export itself is on record. POST /api/audit/export-log -> 204 */
export const logAuditExport = (rows) => call("/audit/export-log", { method: "POST", body: { rows } });
