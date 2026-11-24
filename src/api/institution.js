import { call } from "./client";

// ═══════════════════════════════════════════════════════════════
// INSTITUTION API (API-CONTRACT.md "Institution"). One institution per installation: a school, college or university.
//   GET /api/institution → { name, shortName, city, phone, email, logo (data URL | null), allowStudentPhotos, updatedAt }   any signed-in role
//   GET /api/institution/public → { name, shortName, logo }   NO sign-in needed (login page, tab title)
//   PUT /api/institution { any of the fields above except updatedAt } → the institution   admin only (400 INVALID_INSTITUTION)
//   GET /api/institution/privacy → { text (placeholders filled in), version, effectiveDate | null, updatedAt, reviewed }   NO sign-in needed (public /privacy page).
//        An admin also gets { source (the text as saved, with {{placeholders}}), isTemplate }.
//   PUT /api/institution/privacy { text?, effectiveDate? ("YYYY-MM-DD" | ""), reviewed? } → the admin view   admin only (400 INVALID_PRIVACY)
//        text: plain text, 200–20,000 characters, "## " headings, no HTML. A new wording bumps `version`; the date or `reviewed` do not.
// Rules: lib/institution.js, lib/privacy.js. The logo is resized in the browser (≤256 px wide, ≤100 KB, PNG or JPEG).
// ═══════════════════════════════════════════════════════════════
export const updateInstitution = (patch) => call("/institution", { method: "PUT", body: patch, invalidates: [["institution"], ["branding"]] });

export const updatePrivacy = (patch) => call("/institution/privacy", { method: "PUT", body: patch, invalidates: [["privacy"]] });
