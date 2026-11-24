import { call } from "./client";

// Matches the guide's §7.3: each uploaded item is tagged "outline" or
// "past paper" (plus an optional year for past papers), and the backend
// decides how to extract it (direct text, vision model, or as-is for
// pasted text) based on its type. The "route" label here is a client-side
// best guess only, for the queued-file UI — the real decision always
// happens server-side once a backend exists.
export const guessRoute = (file) => {
  if (!file || typeof file === "string") return { kind: "TXT", route: "AS-IS" };
  const type = file.type || "";
  if (type === "application/pdf") return { kind: "PDF", route: "DIRECT" };
  if (type.startsWith("image/")) return { kind: "IMG", route: "VISION" };
  return { kind: "TXT", route: "AS-IS" };
};

export const ACCEPTED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "text/plain",
];

export const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB


export const MAX_ITEMS_PER_UPLOAD = 20;

/** Years offered for a past paper: this year back 15. */
export const pastPaperYears = (now = new Date()) =>
  Array.from({ length: 16 }, (_, i) => now.getFullYear() - i);

export const ROUTE_LABELS = {
  direct: "Read directly",
  vision: "Read by vision model",
  ocr: "Scanned — OCR",
  "as-is": "Used as-is",
};

/**
 * The multipart body for one upload. `items` are
 * { file: File, tag, year? } or { text: string, tag, year? }, in display order.
 *   · `manifest`   — JSON: [{ source: "file"|"text", name, tag, year? }], one per
 *                    item, in order. `tag` is "outline" or "pastpaper"; `year` is
 *                    only for past papers and optional.
 *   · `files`      — the File items, in the same relative order.
 *   · `pastedText` — the text items, in the same relative order.
 */
export const buildUploadForm = (items) => {
  const form = new FormData();
  form.append(
    "manifest",
    JSON.stringify(
      items.map((it) => ({
        source: it.file ? "file" : "text",
        name: it.file ? it.file.name : "Pasted text",
        tag: it.tag,
        ...(it.tag === "pastpaper" && it.year ? { year: Number(it.year) } : {}),
      })),
    ),
  );
  items.forEach((it) => {
    if (it.file) form.append("files", it.file);
    else form.append("pastedText", it.text || "");
  });
  return form;
};

/**
 * Upload a batch of outline / past-paper material for a subject.
 *
 * Real endpoint: POST /api/subjects/:subjectId/materials (multipart/form-data,
 * see buildUploadForm). Response:
 *   { topics: [{ name, weight, thin }],
 *     items:  [{ index, name, tag, year?, status: "extracted"|"failed",
 *                route: "direct"|"vision"|"ocr"|"as-is", chars, warnings: string[],
 *                error? }],           // one per submitted item, same order
 *     warnings: string[] }            // about the batch as a whole
 * One bad file doesn't fail the batch: it comes back `status: "failed"` with an
 * `error`. Request-level problems are 4xx (INVALID_UPLOAD, INVALID_TAG,
 * INVALID_YEAR, TOO_MANY_ITEMS, FILE_TOO_LARGE, UNSUPPORTED_TYPE).
 */
export const uploadMaterials = (subjectId, items) =>
  call(`/subjects/${subjectId}/materials`, {
    method: "POST",
    body: buildUploadForm(items),
    invalidates: [["materials"], ["clusters"], ["topics"]],
  });

/**
 * Save corrected text for one extracted item. Real endpoint:
 * PUT /api/materials/:id { text } → Material. `400 INVALID_TEXT` (empty),
 * `413 INVALID_TEXT` (over 200,000 chars).
 */
export const updateMaterial = (id, text) =>
  call(`/materials/${id}`, { method: "PUT", body: { text }, invalidates: [["materials"], ["clusters"], ["topics"]] });

/**
 * Throw away edits and re-read the stored original.
 * Real endpoint: POST /api/materials/:id/reextract → Material.
 */
export const reextractMaterial = (id) =>
  call(`/materials/${id}/reextract`, { method: "POST", invalidates: [["materials"], ["clusters"], ["topics"]] });

/** Remove an uploaded item. Real endpoint: DELETE /api/materials/:id (404 if it isn't the teacher's). */
export const deleteMaterial = (id) =>
  call(`/materials/${id}`, { method: "DELETE", invalidates: [["materials"], ["clusters"], ["topics"]] });

/**
 * Replace how a past paper is split into questions (fixes merged/split
 * questions). Real endpoint: PUT /api/materials/:id/questions { questions: string[] }
 * → { materialId, name, questions }. `400 INVALID_QUESTIONS`, `409 NOT_A_PAST_PAPER`.
 * Editing the paper's text later re-splits it from scratch.
 */
export const saveQuestions = (id, questions) =>
  call(`/materials/${id}/questions`, { method: "PUT", body: { questions }, invalidates: [["materials"], ["clusters"], ["topics"]] });
