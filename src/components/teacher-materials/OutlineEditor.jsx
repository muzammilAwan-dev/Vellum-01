import { useState } from "react";
import { updateSubject } from "@/api/subjects";
import { Bento, Field, LoadingButton, SectionHeader, inputClass } from "@/components/common";
import { Button } from "@/components/ui/button";
import { useToast } from "@/context/useToast";
import { useMaterials } from "@/hooks/useMaterials";

const MAX = 20_000;

// ═══════════════════════════════════════════════════════════════
// COURSE OUTLINE — the subject's outline text (PUT /subjects/:id).
// "Fill from uploads" gathers the text of items tagged Outline so you can
// tidy it; nothing changes until you save.
// ═══════════════════════════════════════════════════════════════
// The draft restarts from the saved outline when another subject is chosen or the
// saved text changes (the key), without a reset effect.
export const OutlineEditor = ({ subject }) => <OutlineForm key={`${subject.id}|${subject.outline ?? ""}`} subject={subject} />;

const OutlineForm = ({ subject }) => {
  const toast = useToast();
  const { data } = useMaterials(subject.id);
  const [text, setText] = useState(subject.outline ?? "");
  const [saving, setSaving] = useState(false);

  const outlineUploads = (data ?? []).filter((m) => m.tag === "outline");
  const dirty = text !== (subject.outline ?? "");
  const tooLong = text.length > MAX;

  const fill = () => {
    const joined = outlineUploads.map((m) => `# ${m.name}\n${m.text}`).join("\n\n");
    setText(joined.slice(0, MAX));
    if (joined.length > MAX) toast.push("Trimmed to the 20,000-character limit", "info");
  };

  const save = async () => {
    setSaving(true);
    try {
      await updateSubject(subject.id, { outline: text });
      toast.push("Outline saved", "success");
    } catch (err) {
      toast.push(err.message || "Couldn't save the outline", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Bento className="mt-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SectionHeader label={`${subject.name} course outline`} />
        <Button variant="outline" size="sm" onClick={fill} disabled={!outlineUploads.length}>
          Fill from {outlineUploads.length} outline {outlineUploads.length === 1 ? "upload" : "uploads"}
        </Button>
      </div>
      <Field label="Outline" hint="The units and topics you teach. Topic detection and question generation lean on it.">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          aria-label="Course outline"
          className={`${inputClass} min-h-40`}
        />
      </Field>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className={`text-[12px] ${tooLong ? "text-danger" : "text-ink-3"}`}>
          {text.length.toLocaleString()} / {MAX.toLocaleString()} characters{dirty ? " · unsaved" : ""}
        </span>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" disabled={!dirty || saving} onClick={() => setText(subject.outline ?? "")}>
            Discard
          </Button>
          <LoadingButton size="sm" loading={saving} disabled={!dirty || tooLong} onClick={save}>
            Save outline
          </LoadingButton>
        </div>
      </div>
    </Bento>
  );
};
