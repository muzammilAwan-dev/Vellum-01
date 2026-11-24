import { call } from "@/api/client";
import { useResource } from "./useResource";

/** A student's parent contact → { data: { name, phone, masked } }. Real endpoint: GET /api/students/:id/guardian. */
export const useGuardian = (studentId) =>
  useResource(["guardian", studentId], { fetch: () => call(`/students/${studentId}/guardian`), enabled: !!studentId });
