import { useState } from "react";
import { Chip, ChipRow, Field, ModalShell, inputClass } from "@/components/common";
import { FileCard } from "@/components/common/lms/FileCard";
import { VideoEmbed } from "@/components/common/lms/VideoEmbed";
import { useToast } from "@/context/useToast";
import { cn } from "@/lib/cn";
import { isHttpUrl, validateLesson } from "@/lib/lms";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

// ═══════════════════════════════════════════════════════════════
// LESSON EDITOR — the same rules the server enforces (lib/lms.js), so most
// mistakes are caught here with the message the teacher needs.
// `onSave(lesson)` returns a promise; the editor closes when it resolves and
// stays open (with the server's message as a toast) when it fails.
// `tests` = this subject's published tests, offered as the "related test".
// ═══════════════════════════════════════════════════════════════
export const LessonEditor = (props) =>
  props.open ? <LessonForm key={props.lesson?.id ?? "new"} {...props} /> : null;

const LessonForm = ({ open, onClose, onSave, lesson, tests = [] }) => {
  const toast = useToast();
  const [kind, setKind] = useState(lesson?.kind || "text");
  const [title, setTitle] = useState(lesson?.title || "");
  const [duration, setDuration] = useState(lesson?.duration || "10 min");
  const [body, setBody] = useState(lesson?.body || "");
  const [url, setUrl] = useState(lesson?.url || "");
  const [testId, setTestId] = useState(lesson?.testId || "");
  const [saving, setSaving] = useState(false);

  const needsLink = kind === "video" || kind === "file";
  const badLink = needsLink && url.trim() && !isHttpUrl(url);

  const submit = async () => {
    const payload = { kind, title, duration, body, url, testId: testId || null };
    const problem = validateLesson(payload);
    if (problem) {
      toast.push(problem, "error");
      return;
    }
    setSaving(true);
    try {
      await onSave(payload);
      toast.push(lesson ? "Lesson updated" : "Lesson added", "success");
      onClose();
    } catch (err) {
      toast.push(err.message || "Couldn't save the lesson", "error");
      setSaving(false);
    }
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={lesson ? "Edit lesson" : "New lesson"}
      maxWidth="720px"
      footer={
        <>
          <Button onClick={onClose} variant="ghost">Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Saving…" : lesson ? "Save changes" : "Add lesson"}
          </Button>
        </>
      }
    >
      <div className="mb-4">
        <span className="mb-1.5 block text-[12px] font-medium text-ink-3">Lesson type</span>
        <ChipRow>
          <Chip active={kind === "text"} onClick={() => setKind("text")}>Text / notes</Chip>
          <Chip active={kind === "video"} onClick={() => setKind("video")}>Video</Chip>
          <Chip active={kind === "file"} onClick={() => setKind("file")}>Reference file</Chip>
        </ChipRow>
      </div>
      <Field label="Title">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Newton's three laws, worked examples"
          autoFocus
          maxLength={140}
          className={inputClass}
        />
      </Field>
      <Field label="Duration / size">
        <input
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          placeholder="e.g. 14 min or 2 pages"
          maxLength={40}
          className={inputClass}
        />
      </Field>
      {kind === "video" && (
        <>
          <Field label="Video URL" hint="YouTube, Vimeo, and Google Drive links are all recognised.">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://youtube.com/watch?v=..."
              aria-invalid={badLink || undefined}
              className={cn(inputClass, badLink && "border-danger")}
            />
          </Field>
          {url && !badLink && <VideoEmbed url={url} title={title || "Preview"} />}
        </>
      )}
      {kind === "file" && (
        <>
          <Field label="File URL" hint="Upload the file to Cloudinary (free tier) and paste the resulting URL.">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://res.cloudinary.com/.../reference.pdf"
              aria-invalid={badLink || undefined}
              className={cn(inputClass, badLink && "border-danger")}
            />
          </Field>
          {url && !badLink && <FileCard title={title || "reference.pdf"} url={url} />}
        </>
      )}
      {badLink && <p className="-mt-2 mb-3 text-[12.5px] text-danger">The link must start with http:// or https://</p>}
      <Field label={kind === "text" ? "Content" : "Notes (optional)"}>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={kind === "text" ? 6 : 3}
          placeholder={kind === "text" ? "Write the lesson notes here." : "A line or two students see with the lesson."}
          className={cn(inputClass, "min-h-[96px] resize-y leading-relaxed")}
        />
      </Field>
      <Field label="Related test (optional)" hint="Students see a “Take the test” button on this lesson while the test is open.">
        <Select
          value={testId}
          onChange={setTestId}
          options={[{ value: "", label: "None" }, ...tests.map((t) => ({ value: t.id, label: `${t.title} · ${t.status}` }))]}
        />
      </Field>
    </ModalShell>
  );
};
