import { call } from "@/api/client";
import { useResource } from "./useResource";

/**
 * Everything uploaded to a subject → { data: [Material] }, oldest first.
 * Material: { id, subjectId, name, tag: "outline"|"pastpaper", year?, route:
 * "direct"|"vision"|"ocr"|"as-is", quality: "high"|"med"|"low", chars, text,
 * edited, warnings, createdAt }. `text` is what feeds topic detection, so a
 * teacher's corrections (PUT /materials/:id) replace the machine's reading.
 * Real endpoint: GET /api/subjects/:id/materials.
 */
export const useMaterials = (subjectId) =>
  useResource(["materials", subjectId], {
    fetch: () => call(`/subjects/${subjectId}/materials`),
    enabled: !!subjectId,
  });
