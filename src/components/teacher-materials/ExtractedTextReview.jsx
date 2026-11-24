import { useState } from "react";
import { Sparkles } from "lucide-react";
import { ROUTE_LABELS, reextractMaterial, updateMaterial } from "@/api/materials";
import { ModalShell, StatusDot } from "@/components/common";
import { Button } from "@/components/ui/button";
import { useToast } from "@/context/useToast";
import { useMaterials } from "@/hooks/useMaterials";

const QUALITY = {
  high: { label: "Clean read", tone: "success" },
  med: { label: "Some guesswork", tone: "warning" },
  low: { label: "Poor read", tone: "danger" },
};
const KIND = { direct: "PDF", ocr: "SCAN", vision: "IMG", "as-is": "TXT" };

// ═══════════════════════════════════════════════════════════════
// EXTRACTED TEXT REVIEW
// `materialIds` = the items read in this session. The text comes from the
// server; saving writes only the items you changed (PUT /materials/:id).
// ═══════════════════════════════════════════════════════════════
export const ExtractedTextReview = ({ open, onClose, subjectId, materialIds = [] }) => {
  const toast = useToast();
  const { data, isLoading, error } = useMaterials(subjectId);
  const [edits, setEdits] = useState({});
  const [saving, setSaving] = useState(false);
  const [rereading, setRereading] = useState(null);

  const materials = (data ?? []).filter((m) => materialIds.includes(m.id));

  // `edits` only holds what the teacher has typed or re-read; everything else shows the server text.

  if (!open) return null;

  const dirty = materials.filter((m) => edits[m.id] !== undefined && edits[m.id] !== m.text);
  const close = () => {
    setEdits({});
    onClose();
  };

  const save = async () => {
    if (!dirty.length) {
      close();
      return;
    }
    setSaving(true);
    const results = await Promise.allSettled(dirty.map((m) => updateMaterial(m.id, edits[m.id])));
    setSaving(false);
    const failed = results.map((r, i) => (r.status === "rejected" ? { m: dirty[i], err: r.reason } : null)).filter(Boolean);
    const saved = dirty.length - failed.length;
    if (saved) toast.push(`Saved corrections to ${saved} ${saved === 1 ? "item" : "items"}`, "success");
    failed.forEach(({ m, err }) => toast.push(`${m.name}: ${err.message || "couldn't save"}`, "error"));
    if (!failed.length) close();
  };

  const reread = async (m) => {
    setRereading(m.id);
    try {
      const fresh = await reextractMaterial(m.id);
      setEdits((prev) => ({ ...prev, [m.id]: fresh.text }));
      toast.push(`${m.name} re-read from the original`, "info");
    } catch (err) {
      toast.push(err.message || "Couldn't re-read that file", "error");
    } finally {
      setRereading(null);
    }
  };

  return (
    <ModalShell
      open={open}
      onClose={close}
      title="Review extracted text"
      maxWidth="720px"
      footer={
        <>
          <Button onClick={close} variant="ghost">
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || isLoading}>
            {dirty.length ? `Save ${dirty.length} ${dirty.length === 1 ? "correction" : "corrections"}` : "Done"}
          </Button>
        </>
      }
    >
      <div className="mb-5 flex items-start gap-2.5 rounded-[var(--radius-control)] border border-primary/25 bg-primary-soft px-4 py-3 text-[12.5px] leading-relaxed text-primary">
        <Sparkles size={13} className="mt-0.5 shrink-0" />
        <span>
          <strong className="font-semibold">Check before saving.</strong> Each
          file below was read by a different method. Correct any OCR or
          transcription errors here — the corrected text is what feeds topic
          detection and question generation.
        </span>
      </div>

      {isLoading && <p className="py-6 text-center text-[13px] text-ink-3">Loading the extracted text…</p>}
      {error && (
        <p role="alert" className="py-6 text-center text-[13px] text-danger">
          {error.message || "Couldn't load the extracted text"}
        </p>
      )}
      {!isLoading && !error && materials.length === 0 && (
        <p className="py-6 text-center text-[13px] text-ink-3">Nothing has been read yet.</p>
      )}

      <div className="flex flex-col gap-3.5">
        {materials.map((m) => {
          const q = QUALITY[m.quality] ?? QUALITY.high;
          const changed = edits[m.id] !== undefined && edits[m.id] !== m.text;
          return (
            <div key={m.id} className="overflow-hidden rounded-[var(--radius-container)] border border-rule bg-bg">
              <div className="flex items-center gap-3 border-b border-rule bg-surface px-4 py-3">
                <div className="grid size-8 shrink-0 place-items-center rounded-[var(--radius-control)] bg-primary-dim font-mono text-[12px] font-bold tracking-wider text-primary">
                  {KIND[m.route]}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-medium text-ink">{m.name}</div>
                  <div className="mt-0.5 truncate font-mono text-[12px] text-ink-3">
                    {ROUTE_LABELS[m.route]} · {m.tag === "pastpaper" ? `Past paper${m.year ? ` ${m.year}` : ""}` : "Outline"}
                    {m.edited && " · edited"}
                  </div>
                </div>
                <StatusDot tone={q.tone}>{q.label}</StatusDot>
              </div>
              <div className="p-4">
                <textarea
                  aria-label={`Extracted text of ${m.name}`}
                  value={edits[m.id] ?? m.text}
                  onChange={(e) => setEdits((prev) => ({ ...prev, [m.id]: e.target.value }))}
                  rows={6}
                  className="w-full min-h-[140px] resize-y rounded-[var(--radius-control)] border border-rule-2 bg-bg px-3.5 py-3 font-display text-[15px] leading-relaxed text-ink outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-[12px] text-ink-3">
                    {(edits[m.id] ?? m.text).length.toLocaleString()} characters{changed ? " · unsaved" : ""}
                  </span>
                  {m.route !== "as-is" && (
                    <Button variant="ghost" size="sm" onClick={() => reread(m)} disabled={rereading === m.id}>
                      {rereading === m.id ? "Re-reading…" : "Re-read original"}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </ModalShell>
  );
};
