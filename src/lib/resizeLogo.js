import { LOGO_MAX_BYTES, LOGO_MAX_WIDTH, fitWidth, logoBytes } from "./institution";

// Browser only (needs canvas). Scales a PNG/JPEG down to ≤256 px wide and returns a data URL ≤100 KB.
// PNG first (keeps transparency); if that is too big, JPEG on white. Throws Error with a user-facing message.
const loadImage = (file) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Couldn't read that image")); };
    img.src = url;
  });

export const resizeLogo = async (file) => {
  if (!/^image\/(png|jpeg)$/.test(file.type)) throw new Error("Use a PNG or JPEG image");
  if (file.size > 8 * 1024 * 1024) throw new Error("That file is too large. Choose an image under 8 MB");
  const img = await loadImage(file);
  const { w, h } = fitWidth(img.naturalWidth, img.naturalHeight, LOGO_MAX_WIDTH);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);
  let out = canvas.toDataURL("image/png");
  if (logoBytes(out) > LOGO_MAX_BYTES) {
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    out = canvas.toDataURL("image/jpeg", 0.85);
  }
  if (logoBytes(out) > LOGO_MAX_BYTES) throw new Error("That logo is too detailed. Try a simpler or smaller image");
  return out;
};
