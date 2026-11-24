import { Minus } from "lucide-react";
import { ROUTE_LABELS, pastPaperYears } from "@/api/materials";
import { cn } from "@/lib/cn";
import { Select } from "@/components/ui/select";

const TAGS = [
  { id: "outline", label: "Outline" },
  { id: "pastpaper", label: "Past paper" },
];

// One row in the upload queue: what it is (type badge), how to treat it
// (outline / past paper + year), and — once read — what happened to it.
// state: "queued" | "reading" | "done" | "failed"
export const QueuedItem = ({ item, onChange, onRemove }) => {
  const editable = item.state === "queued" || item.state === "failed";
  const status =
    item.state === "done"
      ? { text: "✓ Extracted", tone: "text-success" }
      : item.state === "reading"
        ? { text: "Reading…", tone: "text-primary" }
        : item.state === "failed"
          ? { text: "Failed", tone: "text-danger" }
          : { text: "Queued", tone: "text-ink-3" };
  const tagLabel = TAGS.find((t) => t.id === item.tag)?.label;

  return (
    <div className="grid grid-cols-[40px_1fr_auto_auto] items-start gap-3.5 px-5 py-3.5">
      <div
        className={cn(
          "grid size-10 place-items-center rounded-[10px] font-mono text-[12px] font-bold tracking-wider",
          item.kind === "PDF" && "bg-danger-dim text-danger",
          item.kind === "IMG" && "bg-primary-dim text-primary",
          item.kind === "TXT" && "bg-warning-dim text-warning",
        )}
      >
        {item.kind}
      </div>

      <div className="min-w-0">
        <div className="truncate text-[13.5px] font-medium text-ink">{item.label}</div>
        <div className="mt-0.5 truncate font-mono text-[12px] text-ink-3">
          {item.state === "done" && item.result
            ? `${ROUTE_LABELS[item.result.route] ?? item.result.route} · ${item.result.chars.toLocaleString()} chars`
            : item.meta}
        </div>

        {editable ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <div role="group" aria-label={`What is ${item.label}?`} className="inline-flex rounded-[var(--radius-control)] border border-rule-2 bg-sunken p-0.5">
              {TAGS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={item.tag === t.id}
                  onClick={() => onChange({ tag: t.id, year: t.id === "pastpaper" ? item.year : "" })}
                  className={cn(
                    "rounded-[calc(var(--radius-control)-2px)] px-2.5 py-1 text-[12px] font-semibold transition-colors",
                    item.tag === t.id ? "bg-primary-dim text-primary" : "text-ink-3 hover:text-ink",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {item.tag === "pastpaper" && (
              <Select
                aria-label={`Year of ${item.label}`}
                value={item.year}
                onChange={(year) => onChange({ year })}
                options={[{ value: "", label: "Year (optional)" }, ...pastPaperYears().map((y) => ({ value: String(y), label: String(y) }))]}
                className="h-9 min-h-0 w-auto py-1 text-[12px]"
              />
            )}
          </div>
        ) : (
          <div className="mt-1.5 text-[12px] font-medium text-ink-2">
            {tagLabel}
            {item.tag === "pastpaper" && item.year ? ` · ${item.year}` : ""}
          </div>
        )}

        {item.state === "failed" && item.error && (
          <div role="alert" className="mt-1.5 text-[12px] font-medium text-danger">
            {item.error}
          </div>
        )}
        {item.state === "done" &&
          item.result?.warnings?.map((w) => (
            <div key={w} className="mt-1.5 text-[12px] font-medium text-warning">
              {w}
            </div>
          ))}
        {item.state === "reading" && (
          <div className="mt-1.5 h-0.5 overflow-hidden rounded-full bg-rule">
            <div className="h-full w-1/3 animate-slide bg-primary" />
          </div>
        )}
      </div>

      <div className={cn("shrink-0 pt-0.5 font-mono text-[12px] font-medium", status.tone)}>{status.text}</div>

      {editable ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${item.label}`}
          className="mt-0.5 grid size-6 place-items-center rounded text-ink-3 transition-colors hover:bg-danger-dim hover:text-danger"
        >
          <Minus size={12} />
        </button>
      ) : (
        <span className="size-6" />
      )}
    </div>
  );
};
