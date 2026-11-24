import { call } from "./client";

// ═══════════════════════════════════════════════════════════════
// CLASS DISCUSSION API — see API-CONTRACT.md ("Class discussion").
// Reads happen through hooks/useThreads (GET /threads); these are the writes.
// Every write returns the updated thread.
// ═══════════════════════════════════════════════════════════════
const refresh = [["threads"]];

/** POST /api/threads — { classId? (teachers), title, body, tag } → thread. 400 INVALID_THREAD. */
export const createThread = (body) => call("/threads", { method: "POST", body, invalidates: refresh });

/** POST /api/threads/:id/replies — { body } → thread. 400 INVALID_REPLY. */
export const addReply = (id, body) => call(`/threads/${id}/replies`, { method: "POST", body: { body }, invalidates: refresh });

/** PUT /api/threads/:id — { pinned? (teacher), resolved? (teacher or author) } → thread. */
export const updateThread = (id, patch) => call(`/threads/${id}`, { method: "PUT", body: patch, invalidates: refresh });

/** DELETE /api/threads/:id — teacher. */
export const deleteThread = (id) => call(`/threads/${id}`, { method: "DELETE", invalidates: refresh });

/** DELETE /api/threads/:id/replies/:replyId — teacher → thread. */
export const deleteReply = (id, replyId) => call(`/threads/${id}/replies/${replyId}`, { method: "DELETE", invalidates: refresh });
