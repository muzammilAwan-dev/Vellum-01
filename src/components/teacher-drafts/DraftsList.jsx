import { useState } from "react";
import { Plus, FileEdit, Clock, Radio, CheckCircle2, Search as SearchIcon } from "lucide-react";
import { Chip, ChipRow, EmptyState, MetricCard, StatusDot, Scope, Td, Th } from "@/components/common";
import { useApp } from "@/context/useApp";
import { Button } from "@/components/ui/button";
import { ActionMenu } from "@/components/ui/menu";
import { Select } from "@/components/ui/select";
import { STATUSES, STATUS_LABEL, STATUS_NOUN, rowPlan, statusCounts, statusNote } from "@/lib/draftRows";

// ═══════════════════════════════════════════════════════════════
// TESTS LIST (drafts, scheduled, live, completed)
// One main button per row (what you most likely do next) and a "more" menu for
// the rest, so every row is one line tall and Delete never looks like Open.
// ═══════════════════════════════════════════════════════════════
const STATUS_TONE = { draft: "muted", scheduled: "primary", live: "danger", completed: "success" };

export const DraftsList = ({
  drafts,
  onOpen,
  onPublish,
  onDelete,
  onNew,
  onRegenerate,
  onDuplicate,
  onLiveView,
  onResults,
  onStartNow,
  onStop,
}) => {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showAllClasses, setShowAllClasses] = useState(false);
  const { activeClassObj, activeSubject } = useApp();

  const activeClass = activeClassObj;
  const classScoped =
    showAllClasses || !activeClass
      ? drafts
      : drafts.filter(
          (d) => d.cls === activeClass.short && (!activeSubject || d.subjectId === activeSubject.id),
        );

  const counts = statusCounts(classScoped);

  const filtered = classScoped
    .filter((d) => filter === "all" || d.status === filter)
    .filter((d) => !search.trim() || d.title.toLowerCase().includes(search.trim().toLowerCase()));

  const emptyKind =
    drafts.length === 0
      ? "no-tests-at-all"
      : filtered.length === 0 && filter !== "all"
        ? "no-match-filter"
        : filtered.length === 0 && search.trim()
          ? "no-match-search"
          : filtered.length === 0 && !showAllClasses && classScoped.length === 0
            ? "no-class-tests"
            : null;

  const emptyCopy = {
    "no-tests-at-all": {
      title: "No tests yet",
      body: "Create your first test and it'll appear here.",
      action: "New test",
      onAction: onNew,
    },
    "no-match-filter": {
      title: `No ${STATUS_NOUN[filter]} tests`,
      body: "Try a different filter or clear it to see all tests.",
      action: "Show all",
      onAction: () => setFilter("all"),
    },
    "no-match-search": {
      title: "No tests match your search",
      body: "Try a shorter query or clear the search.",
      action: "Clear search",
      onAction: () => setSearch(""),
    },
    "no-class-tests": {
      title: `No tests in ${activeClass?.name || "this class"}`,
      body: `Tests belong to the class they were created in. Either start a new test for ${activeClass?.name || "this class"}, or view tests from all classes.`,
      action: "Show all classes",
      onAction: () => setShowAllClasses(true),
    },
  }[emptyKind];

  // Handlers by action id, shared by the primary button and the menu.
  const run = (id, d) => {
    switch (id) {
      case "open":
        return onOpen(d);
      case "publish":
        return onPublish(d);
      case "regenerate":
        return onRegenerate?.(d);
      case "duplicate":
        return onDuplicate?.(d);
      case "start":
        return onStartNow?.(d);
      case "live":
        return onLiveView?.(d);
      case "stop":
        return onStop?.(d);
      case "results":
        return onResults?.(d);
      case "delete":
        return onDelete(d);
      default:
        return undefined;
    }
  };

  const showScopeSelect = activeClass && (drafts.length > classScoped.length || showAllClasses);

  return (
    <div className="mx-auto max-w-[1360px] px-5 py-6 tablet:px-10 tablet:py-8">
      <div className="mb-5 flex items-center gap-2 text-[13px] font-medium text-ink-3">
        <Scope /> <span className="text-ink-3">/</span> Tests
      </div>

      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-serif text-[28px] font-semibold leading-[1.1] tracking-[-0.02em] text-ink tablet:text-[34px]">
            Tests
          </h1>
          <p className="mt-2 max-w-[680px] text-[14px] leading-relaxed text-ink-2">
            Every test you've drafted, scheduled or run. Publish a draft, open one to edit it, or check the
            results once it closes.
          </p>
        </div>
        <Button onClick={onNew}>
          <Plus size={14} /> New test
        </Button>
      </div>

      {/* KPI bento */}
      <div className="bento mb-10">
        <MetricCard
          icon={FileEdit}
          iconTone="neutral"
          label="Drafts"
          value={counts.draft}
          delta="Awaiting publish"
          deltaTone="success"
        />
        <MetricCard
          icon={Clock}
          iconTone="primary"
          label="Scheduled"
          value={counts.scheduled}
          delta="Opening soon"
          deltaTone="success"
        />
        <MetricCard
          icon={Radio}
          iconTone={counts.live > 0 ? "danger" : "neutral"}
          label="Live now"
          value={counts.live}
          delta={counts.live > 0 ? "Students working" : "None running"}
          deltaTone={counts.live > 0 ? "danger" : "success"}
        />
        <MetricCard
          icon={CheckCircle2}
          iconTone="success"
          label="Completed"
          value={counts.completed}
          delta="Graded & released"
          deltaTone="success"
        />
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="flex h-10 min-w-[240px] flex-1 items-center gap-2.5 rounded-[var(--radius-control)] border border-rule-2 bg-surface px-3.5 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15 narrow:max-w-[360px]">
          <SearchIcon size={14} className="shrink-0 text-ink-3" aria-hidden="true" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tests by title…"
            aria-label="Search tests by title"
            className="min-w-0 flex-1 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-3"
          />
        </label>
        <ChipRow>
          {["all", ...STATUSES].map((f) => (
            <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>
              {f === "all" ? "All" : STATUS_LABEL[f]}
              <span className="ml-1.5 tabular-nums opacity-70">{counts[f]}</span>
            </Chip>
          ))}
        </ChipRow>
        {showScopeSelect && (
          <Select
            aria-label="Class scope"
            value={showAllClasses ? "all" : "current"}
            onChange={(v) => setShowAllClasses(v === "all")}
            options={[
              {
                value: "current",
                label: `${activeSubject?.name ? `${activeSubject.name} · ` : ""}${activeClass.short}`,
              },
              { value: "all", label: `All classes · ${drafts.length} tests` },
            ]}
            className="h-10 min-h-0 w-auto max-w-full py-0 text-[12.5px] font-medium pointer-coarse:h-12"
          />
        )}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-[var(--radius-container)] border border-rule bg-surface shadow-[var(--shadow-card)]">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-rule-2">
                <Th>Test</Th>
                <Th className="max-tablet:hidden">Class</Th>
                <Th className="text-right max-narrow:hidden">Questions</Th>
                <Th className="text-right max-tablet:hidden">Marks</Th>
                <Th className="hidden 2xl:table-cell">Source</Th>
                <Th className="max-narrow:hidden">Status</Th>
                <Th className="max-tablet:hidden">Last edited</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && emptyCopy && (
                <tr>
                  <td colSpan={8} className="p-0">
                    <EmptyState
                      compact
                      title={emptyCopy.title}
                      body={emptyCopy.body}
                      action={emptyCopy.action}
                      onAction={emptyCopy.onAction}
                    />
                  </td>
                </tr>
              )}
              {filtered.map((d) => {
                const plan = rowPlan(d);
                const note = statusNote(d);
                const status = (
                  <>
                    <StatusDot tone={STATUS_TONE[d.status]}>{STATUS_LABEL[d.status]}</StatusDot>
                    {note && <div className="mt-0.5 text-[12px] tabular-nums text-ink-3">{note}</div>}
                  </>
                );
                return (
                  <tr
                    key={d.id}
                    onClick={() => onOpen(d)}
                    className="cursor-pointer border-b border-rule transition-colors last:border-b-0 hover:bg-raised/50"
                  >
                    <Td className="text-[13.5px] font-medium text-ink">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpen(d);
                            }}
                            className="min-w-0 truncate rounded-sm text-left font-medium text-ink hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring/40"
                          >
                            {d.title}
                          </button>
                          {d.mode === "personal" && (
                            <span className="shrink-0 whitespace-nowrap rounded-full bg-raised px-2 py-0.5 text-[12px] font-medium text-ink-3">
                              Per student
                            </span>
                          )}
                        </div>
                        {d.regeneratedAt && (
                          <div className="mt-0.5 font-mono text-[12px] text-ink-3">
                            Regenerated {d.regeneratedAt}
                          </div>
                        )}
                        <div className="mt-1.5 font-normal narrow:hidden">{status}</div>
                      </div>
                    </Td>
                    <Td className="font-mono text-[12px] max-tablet:hidden">{d.cls}</Td>
                    <Td className="text-right font-mono tabular-nums max-narrow:hidden">{d.questions}</Td>
                    <Td className="text-right font-mono tabular-nums max-tablet:hidden">{d.marks}</Td>
                    <Td className="hidden 2xl:table-cell">
                      {d.questionSet?.length > 0 || d.variants?.length > 0 ? (
                        <span className="whitespace-nowrap rounded-full border border-primary/25 bg-primary-dim px-2 py-0.5 text-[12px] font-medium text-primary">
                          AI-generated
                        </span>
                      ) : (
                        <span className="whitespace-nowrap rounded-full bg-raised px-2 py-0.5 text-[12px] font-medium text-ink-3">
                          Settings only
                        </span>
                      )}
                    </Td>
                    <Td className="max-narrow:hidden">{status}</Td>
                    <Td className="whitespace-nowrap font-mono text-[12px] text-ink-3 max-tablet:hidden">
                      {d.lastEdited}
                    </Td>
                    <Td className="whitespace-nowrap px-2 text-right narrow:px-4">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant={plan.primary.id === "publish" ? "default" : "outline"}
                          onClick={(e) => {
                            e.stopPropagation();
                            run(plan.primary.id, d);
                          }}
                        >
                          {plan.primary.label}
                        </Button>
                        <ActionMenu
                          label={`More actions for ${d.title}`}
                          items={plan.menu.map((m) => ({ ...m, onSelect: () => run(m.id, d) }))}
                        />
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
