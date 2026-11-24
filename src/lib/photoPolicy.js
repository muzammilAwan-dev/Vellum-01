// ═══════════════════════════════════════════════════════════════
// PHOTO POLICY (pure; the fake server decides with it, the real server ports it — B15)
// Who may see whose photo, and who may upload one. Student photos are personal data of children:
// they exist only while the institution switches `allowStudentPhotos` on, teachers see them only for
// their own classes, and classmates never see each other's.
// ═══════════════════════════════════════════════════════════════
import { logoBytes } from "./institution";

export const PHOTO_SIZE = 256; // pixels, square
export const PHOTO_MAX_BYTES = 60 * 1024;
export const PHOTO_SOURCE_MAX_BYTES = 5 * 1024 * 1024;
const PHOTO_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

/** `null` when `dataUrl` is an acceptable photo, else a user-facing message. */
export const validatePhotoDataUrl = (dataUrl) => {
  if (typeof dataUrl !== "string" || !PHOTO_RE.test(dataUrl)) return "Use a JPEG, PNG or WebP image";
  if (logoBytes(dataUrl) > PHOTO_MAX_BYTES) return "The photo must be under 60 KB";
  return null;
};

/**
 * Whether `viewer` may see `owner`'s photo.
 * viewer = { id, role, classIds? } · owner = { id, role, classId? } · institution = { allowStudentPhotos }
 */
export const canSeePhoto = ({ viewer, owner, institution }) => {
  if (!viewer || !owner) return false;
  if (viewer.id === owner.id) return true; // your own
  if (viewer.role === "admin") return true;
  if (owner.role !== "student") return true; // staff photos: every signed-in user
  if (viewer.role !== "teacher") return false; // a student never sees another student's
  return institution?.allowStudentPhotos === true && (viewer.classIds ?? []).includes(owner.classId);
};

/** Students may add a photo only while the institution allows it; staff always may. */
export const canUploadPhoto = ({ role, institution }) => role !== "student" || institution?.allowStudentPhotos === true;
