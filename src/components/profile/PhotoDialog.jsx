import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from "lucide-react";
import AvatarEditor from "react-avatar-editor";
import { useRef, useState } from "react";
import { LoadingButton, ModalShell } from "@/components/common";
import { Button } from "@/components/ui/button";
import { encodePhoto } from "@/lib/encodePhoto";
import { PHOTO_SIZE, PHOTO_SOURCE_MAX_BYTES } from "@/lib/photoPolicy";

const NUDGE = 0.04;
const clamp01 = (n) => Math.min(1, Math.max(0, n));

// Choose a picture, frame it (drag, zoom, or the arrow buttons: dragging alone would not work for
// keyboard users), save. The crop is re-encoded to a 256 px JPEG in the browser before it is sent.
export const PhotoDialog = ({ open, onClose, onSave }) => {
  const editor = useRef(null);
  const [file, setFile] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0.5, y: 0.5 });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const close = () => {
    setFile(null);
    setZoom(1);
    setPos({ x: 0.5, y: 0.5 });
    setError(null);
    onClose();
  };

  const pick = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return setError("Use a JPEG, PNG or WebP image");
    if (f.size > PHOTO_SOURCE_MAX_BYTES) return setError("That file is over 5 MB. Choose a smaller one");
    setError(null);
    setZoom(1);
    setPos({ x: 0.5, y: 0.5 });
    setFile(f);
  };

  const save = async () => {
    setSaving(true);
    try {
      const canvas = editor.current?.getImageScaledToCanvas();
      if (!canvas) throw new Error("Choose a picture first");
      await onSave(encodePhoto(canvas));
      close();
    } catch (err) {
      setError(err.message || "Couldn't save the photo");
    } finally {
      setSaving(false);
    }
  };

  const nudge = (dx, dy) => setPos((p) => ({ x: clamp01(p.x + dx), y: clamp01(p.y + dy) }));

  return (
    <ModalShell
      open={open}
      onClose={close}
      title="Profile photo"
      maxWidth="420px"
      footer={
        <>
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <LoadingButton loading={saving} disabled={!file} onClick={save}>Save photo</LoadingButton>
        </>
      }
    >
      <label className="mb-4 block">
        <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Choose a picture</span>
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={pick} className="block w-full text-[13px] text-ink-2 file:mr-3 file:min-h-10 file:rounded-[var(--radius-control)] file:border file:border-rule-2 file:bg-surface file:px-3.5 file:text-[13px] file:font-semibold file:text-ink" />
      </label>
      {file && (
        <>
          <div className="mb-4 grid place-items-center overflow-hidden rounded-[var(--radius-control)] bg-sunken py-3">
            <AvatarEditor
              ref={editor}
              image={file}
              width={PHOTO_SIZE}
              height={PHOTO_SIZE}
              border={16}
              borderRadius={PHOTO_SIZE / 2}
              color={[0, 0, 0, 0.45]}
              scale={zoom}
              position={pos}
              onPositionChange={setPos}
              onLoadFailure={() => { setFile(null); setError("Couldn't read that image"); }}
              style={{ maxWidth: "100%", height: "auto", touchAction: "none" }}
            />
          </div>
          <label className="mb-3 flex items-center gap-3 text-[13px] text-ink-2">
            <span className="w-12 shrink-0">Zoom</span>
            <input type="range" min="1" max="3" step="0.02" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="h-6 min-w-0 flex-1 accent-[var(--color-primary)]" />
          </label>
          <div className="flex items-center gap-3 text-[13px] text-ink-2">
            <span className="w-12 shrink-0">Move</span>
            <div className="flex gap-1.5">
              <Button type="button" variant="outline" size="icon" aria-label="Move picture left" onClick={() => nudge(-NUDGE, 0)}><ArrowLeft aria-hidden="true" /></Button>
              <Button type="button" variant="outline" size="icon" aria-label="Move picture right" onClick={() => nudge(NUDGE, 0)}><ArrowRight aria-hidden="true" /></Button>
              <Button type="button" variant="outline" size="icon" aria-label="Move picture up" onClick={() => nudge(0, -NUDGE)}><ArrowUp aria-hidden="true" /></Button>
              <Button type="button" variant="outline" size="icon" aria-label="Move picture down" onClick={() => nudge(0, NUDGE)}><ArrowDown aria-hidden="true" /></Button>
            </div>
          </div>
        </>
      )}
      {error && <p role="alert" className="mt-3 text-[13px] text-danger">{error}</p>}
    </ModalShell>
  );
};
