import { call } from "./client";

// ═══════════════════════════════════════════════════════════════
// PARENT CONTACT API (API-CONTRACT.md "Parent contact"). Admin, or the teacher of the student's class.
//   GET /api/students/:id/guardian → { name, phone, masked }   (read through hooks/useGuardian)
//   PUT /api/students/:id/guardian { name?, phone? } → { name, phone, masked }
//        only the keys sent change, "" removes; phone is a Pakistani mobile in any usual format and is stored as 92XXXXXXXXXX
//        400 INVALID_GUARDIAN · 403 (a student) · 404 (not your student)
// The number never appears in any other payload (lists, analytics, reports, audit events).
// ═══════════════════════════════════════════════════════════════
export const saveGuardian = (studentId, patch) =>
  call(`/students/${studentId}/guardian`, { method: "PUT", body: patch, invalidates: [["guardian", studentId]] });
