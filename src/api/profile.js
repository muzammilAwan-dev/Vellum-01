import { call } from "./client";

// ═══════════════════════════════════════════════════════════════
// PROFILE API (API-CONTRACT.md "Profile"). Own data only, every role.
//   GET   /api/profile → { id, name, email, role, rollNo?, classes[], subjects[], bio, phone,
//                          photoUrl, prefs, previousLoginAt }   (read through hooks/useProfile)
//   PATCH /api/profile { bio?, phone?, prefs? } → the profile   (400 INVALID_PROFILE)
// Name, email, role, roll number and class are admin-only (PUT /users/:id).
// ═══════════════════════════════════════════════════════════════
// Photo (F13d). The browser crops and re-encodes to a 256 px JPEG first (lib/encodePhoto.js).
//   PUT    /api/profile/photo { dataUrl } → the profile   (400 INVALID_PHOTO · 403 PHOTOS_DISABLED for a student while the institution switch is off)
//   DELETE /api/profile/photo             → the profile
// The photo comes back as `photoUrl`, which the server fills only for viewers allowed to see it (lib/photoPolicy.js), else null.
const photoKeys = [["profile"], ["threads"]];
export const setPhoto = (dataUrl) => call("/profile/photo", { method: "PUT", body: { dataUrl }, invalidates: photoKeys });
export const removePhoto = () => call("/profile/photo", { method: "DELETE", invalidates: photoKeys });

export const updateProfile = (patch) =>
  call("/profile", { method: "PATCH", body: patch, invalidates: [["profile"]] });
