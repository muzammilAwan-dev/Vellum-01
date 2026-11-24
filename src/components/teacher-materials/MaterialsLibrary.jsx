import { FileText } from "lucide-react";
import { ROUTE_LABELS, deleteMaterial, reextractMaterial } from "@/api/materials";
import { Bento, PageError, SectionHeader, StatusDot } from "@/components/common";
import { Button } from "@/components/ui/button";
import { useApp } from "@/context/useApp";
import { useToast } from "@/context/useToast";
import { useMaterials } from "@/hooks/useMaterials";
import { formatDateTime } from "@/lib/time";

const QUALITY = {
  high: { label: "Clean read", tone: "success" },
  med: { label: "Some guesswork", tone: "warning" },
  low: { label: "Poor read", tone: "danger" },
};

// ═══════════════════════════════════════════════════════════════
// MATERIALS LIBRARY — everything uploaded to the active subject.
// Review/correct the text, re-read the original, or delete an item.
// ═══════════════════════════════════════════════════════════════
export const MaterialsLibrary = ({ subjectId, subjectName, onReview }) => {
  const toast = useToast();
  const { setConfirmState } = useApp();
  const { data, isLoading, error, refetch } = useMaterials(subjectId);

  if (error) return <PageError error={error} onRetry={refetch} />;
  const materials = [...(data ?? [])].reverse(); // newest first
  const rereadable = materials.filter((m) => m.route !== "as-is");

  const run = async (fn, ok, fallback) => {
    try {
      await fn();
      if (ok) toast.push(ok, "info");
    } catch (err) {
      toast.push(err.message || fallback, "error");
    }
  };

  const confirmReread = (list, title) =>
    setConfirmState({
      title,
      message: "Corrections you made to the text will be discarded and replaced with a fresh reading of the original.",
      confirmLabel: "Re-read",
      onConfirm: () =>
        run(
          async () => {
            for (const m of list) await reextractMaterial(m.id);
          },
          `Re-read ${list.length} ${list.length === 1 ? "item" : "items"}`,
          "Couldn't re-read that file",
        ),
    });

  return (
    <Bento className="mt-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SectionHeader label={`Uploaded to ${subjectName} · ${materials.length}`} />
        {rereadable.length > 1 && (
          <Button variant="outline" size="sm" onClick={() => confirmReread(rereadable, `Re-read all ${rereadable.length} files?`)}>
            Re-read all
          </Button>
        )}
      </div>

      {isLoading && <p className="py-6 text-center text-[13px] text-ink-3">Loading…</p>}

      {!isLoading && materials.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <div className="grid size-12 place-items-center rounded-xl bg-raised text-ink-3">
            <FileText size={20} />
          </div>
          <p className="max-w-[320px] text-[13px] leading-relaxed text-ink-3">
            Nothing uploaded to {subjectName} yet. Files you read above are kept here so you can fix their text later.
          </p>
        </div>
      )}

      <div className="flex flex-col divide-y divide-rule">
        {materials.map((m) => {
          const q = QUALITY[m.quality] ?? QUALITY.high;
          return (
            <div key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
              <div className="min-w-0 flex-1 basis-56">
                <div className="truncate text-[13.5px] font-medium text-ink">{m.name}</div>
                <div className="mt-0.5 truncate font-mono text-[12px] text-ink-3">
                  {m.tag === "pastpaper" ? `Past paper${m.year ? ` ${m.year}` : ""}` : "Outline"} · {ROUTE_LABELS[m.route]} ·{" "}
                  {m.chars.toLocaleString()} chars{m.edited ? " · edited" : ""} · {formatDateTime(m.createdAt)}
                </div>
              </div>
              <StatusDot tone={q.tone}>{q.label}</StatusDot>
              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" size="sm" onClick={() => onReview(m.id)}>
                  Review text
                </Button>
                {m.route !== "as-is" && (
                  <Button variant="ghost" size="sm" onClick={() => confirmReread([m], `Re-read ${m.name}?`)}>
                    Re-read
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setConfirmState({
                      title: `Delete ${m.name}?`,
                      message: "It will no longer feed topic detection or question generation. Tests already made keep their questions.",
                      confirmLabel: "Delete",
                      onConfirm: () => run(() => deleteMaterial(m.id), `Deleted ${m.name}`, "Couldn't delete the file"),
                    })
                  }
                >
                  Delete
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </Bento>
  );
};
