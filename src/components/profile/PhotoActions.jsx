import { useState } from "react";
import { ConfirmDialog } from "@/components/common";
import { Button } from "@/components/ui/button";
import { useApp } from "@/context/useApp";
import { useToast } from "@/context/useToast";
import { removePhoto, setPhoto } from "@/api/profile";
import { canUploadPhoto } from "@/lib/photoPolicy";
import { PhotoDialog } from "./PhotoDialog";

// "Add / change photo" and "Remove photo" under the profile header. A student sees the buttons only
// while the institution allows student photos (the server enforces it too).
export const PhotoActions = ({ profile, institution }) => {
  const { refreshUser } = useApp();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const allowed = canUploadPhoto({ role: profile.role, institution });

  if (!allowed) {
    return <p className="mt-3 max-w-[44ch] text-[12.5px] leading-relaxed text-ink-3">Your institution has switched student photos off, so your initials are shown.</p>;
  }

  const save = async (dataUrl) => {
    await setPhoto(dataUrl);
    await refreshUser();
    toast.push("Photo saved", "success");
  };
  const remove = async () => {
    try {
      await removePhoto();
      await refreshUser();
      toast.push("Photo removed", "success");
    } catch (err) {
      toast.push(err.message || "Couldn't remove the photo", "error");
    }
  };

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        {profile.photoUrl ? "Change photo" : "Add photo"}
      </Button>
      {profile.photoUrl && (
        <Button type="button" variant="ghost" size="sm" onClick={() => setConfirm(true)}>
          Remove photo
        </Button>
      )}
      <PhotoDialog open={open} onClose={() => setOpen(false)} onSave={save} />
      <ConfirmDialog
        open={confirm}
        title="Remove your photo?"
        message="Your initials are shown instead. You can add a photo again any time."
        confirmLabel="Remove photo"
        onConfirm={remove}
        onClose={() => setConfirm(false)}
      />
    </div>
  );
};
