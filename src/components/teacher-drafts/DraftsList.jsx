import { useState } from "react";
import { Plus } from "lucide-react";
import { Chip, ChipRow, EmptyState, PageHeader, Scope, SearchField, StatusDot, Td, Th } from "@/components/common";
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
const STATUS_TONE = { draft: "muted", scheduled: "primary", live: "live", completed: "success" };

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
      <PageHeader
        crumbs={[{ label: <Scope /> }, { label: "Tests" }]}
        title="Tests"
        intro="Every test you've drafted, scheduled or run. Publish a draft, open one to edit it, or check the results once it closes."
        actions={
          <Button onClick={onNew}>
            <Plus size={14} aria-hidden="true" /> New test
          </Button>
        }
      />

      {/* Filters: the chips carry the counts (no separate row of tiles saying the same). */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchField label="Search tests by title" value={search} onChange={setSearch} placeholder="Search tests by title…" className="w-full narrow:w-[300px]" />
        <ChipRow>
          {["all", ...STATUSES].map((f) => (
            <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>
              {f === "all" ? "All" : STATUS_LABEL[f]}
              <span className="ml-1.5 tabular-nums">{counts[f]}</span>
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
        <div className="overflow-x-auto focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40" tabIndex={0} role="region" aria-label="Tests">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-rule-2">
                <Th>Test</Th>
                <Th className="max-lg:hidden">Class</Th>
                <Th className="text-right max-lg:hidden">Questions</Th>
                <Th className="text-right max-lg:hidden">Marks</Th>
                <Th className="hidden 2xl:table-cell">Source</Th>
                <Th className="max-lg:hidden">Status</Th>
                <Th className="max-xl:hidden">Last edited</Th>
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
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpen(d);
                            }}
                            className="inline-flex min-h-8 min-w-0 items-center rounded-sm text-left font-medium text-ink [overflow-wrap:anywhere] hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring/40"
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
                        <div className="mt-1.5 font-normal lg:hidden">{status}</div>
                        <div className="mt-0.5 text-[12px] font-normal text-ink-3 lg:hidden">{d.questions} questions · {d.marks} marks</div>
                      </div>
                    </Td>
                    <Td className="font-mono text-[12px] max-lg:hidden">{d.cls}</Td>
                    <Td className="text-right font-mono tabular-nums max-lg:hidden">{d.questions}</Td>
                    <Td className="text-right font-mono tabular-nums max-lg:hidden">{d.marks}</Td>
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
                    <Td className="max-lg:hidden">{status}</Td>
                    <Td className="whitespace-nowrap font-mono text-[12px] text-ink-3 max-xl:hidden">
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
