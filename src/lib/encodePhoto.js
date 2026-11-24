import { PHOTO_MAX_BYTES, PHOTO_SIZE } from "./photoPolicy";
import { logoBytes } from "./institution";

// Browser only. Redraws the cropped square onto a fresh 256×256 canvas and exports a JPEG, which also
// drops EXIF data (camera, location). Lowers the quality until it fits the 60 KB limit.
export const encodePhoto = (sourceCanvas) => {
  const canvas = document.createElement("canvas");
  canvas.width = PHOTO_SIZE;
  canvas.height = PHOTO_SIZE;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, PHOTO_SIZE, PHOTO_SIZE);
  ctx.drawImage(sourceCanvas, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
  for (const quality of [0.85, 0.7, 0.55, 0.4]) {
    const url = canvas.toDataURL("image/jpeg", quality);
    if (logoBytes(url) <= PHOTO_MAX_BYTES) return url;
  }
  throw new Error("That photo is too detailed. Try another one");
};
