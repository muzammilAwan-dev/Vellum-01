import { Fragment, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ClipboardCheck, Flag, Percent, Users } from "lucide-react";
import {
  Bento,
  Chip,
  ChipRow,
  EmptyState,
  MetricCard,
  PageError,
  PageHeader,
  PageLoading,
  RowToggle,
  SectionHeader,
  StatusDot,
  TableShell,
  Td,
  Th,
} from "@/components/common";
import { Button } from "@/components/ui/button";
import { useTestResults } from "@/hooks/useAttempts";
import { cn } from "@/lib/cn";
import {
  clock,
  flagTimeline,
  matchesFilter,
  percentOf,
  RESULT_FILTERS,
  rowState,
  SEVERITY_LABEL,
  SUBMIT_REASON,
  summarizeFlags,
} from "@/lib/resultsView";
import { formatDateTime } from "@/lib/time";

const SEVERITY_CHIP = {
  high: "bg-danger-dim text-danger",
  medium: "bg-warning-dim text-warning",
  low: "bg-raised text-ink-3",
};

const STATE_META = {
  submitted: { label: "Submitted", tone: "success" },
  marking: { label: "Awaiting marks", tone: "warning" },
  working: { label: "Working", tone: "primary" },
  closing: { label: "Submitting…", tone: "warning" },
  silent: { label: "No signal", tone: "danger" },
  "not-started": { label: "Not started", tone: "muted" },
};

const FlagChip = ({ severity, children }) => (
  <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-semibold", SEVERITY_CHIP[severity])}>
    {children}
  </span>
);

const Detail = ({ attempt }) => {
  const events = flagTimeline(attempt.flags, attempt.startedAt);
  const summary = summarizeFlags(attempt.flags);
  return (
    <div className="grid gap-6 px-4 py-4 tablet:grid-cols-[minmax(0,1fr)_260px]">
      <div className="min-w-0">
        <div className="mb-2 text-[12px] font-semibold text-ink-3">Event timeline</div>
        {events.length === 0 ? (
          <p className="text-[13px] text-ink-3">Nothing was reported from this student's browser.</p>
        ) : (
          <ol className="space-y-1.5">
            {events.map((e, i) => (
              <li key={`${e.type}-${e.at}-${i}`} className="flex items-center gap-3 text-[13px]">
                <span className="w-14 shrink-0 font-mono text-[12px] tabular-nums text-ink-3">
                  +{clock(e.offsetMs)}
                </span>
                <FlagChip severity={e.severity}>{SEVERITY_LABEL[e.severity]}</FlagChip>
                <span className="min-w-0 text-ink">{e.label}</span>
                <span className="ml-auto hidden shrink-0 font-mono text-[12px] text-ink-3 narrow:inline">
                  {formatDateTime(e.at)}
                </span>
              </li>
            ))}
          </ol>
        )}
        <p className="mt-3 text-[12px] text-ink-3">
          Events are clues from the student's browser, not proof. Network drops and accidental clicks look the same.
        </p>
      </div>
      <dl className="space-y-2 text-[13px]">
        <div>
          <dt className="text-[12px] font-semibold text-ink-3">Started</dt>
          <dd className="text-ink">{formatDateTime(attempt.startedAt)}</dd>
        </div>
        {attempt.submittedAt && (
          <div>
            <dt className="text-[12px] font-semibold text-ink-3">Ended</dt>
            <dd className="text-ink">
              {formatDateTime(attempt.submittedAt)} · {SUBMIT_REASON[attempt.submitReason] ?? attempt.submitReason}
            </dd>
          </div>
        )}
        <div>
          <dt className="text-[12px] font-semibold text-ink-3">Last heard from browser</dt>
          <dd className={attempt.clientSilent ? "font-medium text-danger" : "text-ink"}>
            {formatDateTime(attempt.lastSeenAt)}
            {attempt.clientSilent && " — no signal"}
          </dd>
        </div>
        {summary.byType.length > 0 && (
          <div>
            <dt className="text-[12px] font-semibold text-ink-3">By type</dt>
            <dd className="mt-1 space-y-0.5">
              {summary.byType.map((t) => (
                <div key={t.type} className="flex justify-between gap-3 text-ink-2">
                  <span>{t.label}</span>
                  <span className="font-mono tabular-nums">{t.count}</span>
                </div>
              ))}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
};

const TeacherTestResults = () => {
  const { testId } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useTestResults(testId);
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState(() => new Set());

  const ended = data?.test.status === "completed";
  const rows = useMemo(
    () =>
      (data?.rows ?? [])
        .filter((r) => matchesFilter(r, filter, ended))
        .sort((a, b) => a.student.name.localeCompare(b.student.name)),
    [data, filter, ended],
  );

  if (isLoading) return <PageLoading />;
  if (error?.code === "NOT_PUBLISHED" || error?.status === 404) {
    return (
      <EmptyState
        title={error.status === 404 ? "Test not found" : "No results yet"}
        body={error.status === 404 ? "It may have been deleted." : "This test hasn't been published."}
        action="Back to tests"
        onAction={() => navigate("/teacher/drafts")}
      />
    );
  }
  if (error) return <PageError error={error} onRetry={refetch} />;

  const { test, summary } = data;
  const toggle = (id) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="mx-auto max-w-[1360px] px-5 py-6 tablet:px-10 tablet:py-8">
      <PageHeader
        crumbs={[{ label: `${test.subject} · ${test.cls}` }, { label: "Tests", to: "/teacher/drafts" }, { label: "Results" }]}
        title={test.title}
        titleNote={test.status === "live" ? <StatusDot tone="live">Live</StatusDot> : null}
        intro={[
          test.status === "live" ? "Still open: numbers update as students finish" : "This test has ended",
          `${test.questionCount} questions`,
          `${test.totalMarks} marks`,
        ].join(" · ") + "."}
        actions={
          <>
            {test.status === "live" && (
              <Button variant="outline" onClick={() => navigate(`/teacher/live?test=${test.id}`)}>
                Live control
              </Button>
            )}
            <Button onClick={() => navigate("/teacher/review")}>
              {summary.awaitingMarks > 0 ? `Review ${summary.awaitingMarks} ${summary.awaitingMarks === 1 ? "mark" : "marks"}` : "Grade review"}
            </Button>
          </>
        }
      />

      <div className="bento mb-8">
        <MetricCard
          icon={Users}
          iconTone="success"
          label="Submitted"
          value={summary.submitted}
          unit={`/ ${summary.students}`}
          delta={summary.started > summary.submitted ? `${summary.started - summary.submitted} still open` : "Answers received"}
          deltaTone="success"
        />
        <MetricCard
          icon={Percent}
          iconTone="primary"
          label="Average"
          value={summary.averagePercent ?? "—"}
          unit={summary.averagePercent != null ? "%" : undefined}
          delta={
            summary.averagePercent != null
              ? `Range ${summary.lowestPercent}–${summary.highestPercent}%`
              : "No fully marked attempts yet"
          }
          deltaTone="success"
        />
        <MetricCard
          icon={ClipboardCheck}
          iconTone={summary.awaitingMarks > 0 ? "warning" : "neutral"}
          label="Awaiting marks"
          value={summary.awaitingMarks}
          delta={summary.awaitingMarks > 0 ? "Written answers to confirm" : "Nothing pending"}
          deltaTone={summary.awaitingMarks > 0 ? "danger" : "success"}
        />
        <MetricCard
          icon={Flag}
          iconTone={summary.flagged > 0 ? "danger" : "neutral"}
          label="Flagged"
          value={summary.flagged}
          unit={`/ ${summary.students}`}
          delta={summary.silent > 0 ? `${summary.silent} with no signal` : "Browser-reported events"}
          deltaTone={summary.flagged > 0 || summary.silent > 0 ? "danger" : "success"}
        />
      </div>

      <section>
        <SectionHeader label="Students" meta="open a student for their answers and event timeline" />
        <div className="mb-3">
          <ChipRow>
            {RESULT_FILTERS.map((f) => (
              <Chip key={f.id} active={filter === f.id} onClick={() => setFilter(f.id)}>
                {f.label}
              </Chip>
            ))}
          </ChipRow>
        </div>
        <TableShell stack label="Students and their results">
          <thead>
            <tr className="border-b border-rule-2">
              <Th>Student</Th>
              <Th>Status</Th>
              <Th className="text-right">Marks</Th>
              <Th className="text-right">Time taken</Th>
              <Th>Flags</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="p-0">
                  <EmptyState compact title="No students match" body="Try a different filter." />
                </td>
              </tr>
            )}
            {rows.map(({ student, attempt }) => {
              const state = rowState(attempt, ended);
              const meta = STATE_META[state];
              const flags = summarizeFlags(attempt?.flags);
              const pct = percentOf(attempt?.marks);
              const expandable = Boolean(attempt);
              const expanded = open.has(student.id);
              return (
                <Fragment key={student.id}>
                  <tr className="border-b border-rule last:border-b-0 hover:bg-raised/50">
                    <Td className="text-[13.5px] font-medium text-ink">
                      {expandable ? (
                        <RowToggle open={expanded} onToggle={() => toggle(student.id)} controls={`result-${student.id}`}>
                          {student.name}
                        </RowToggle>
                      ) : (
                        // Same 20 px icon slot as the toggle, so every name lines up.
                        <span className="inline-flex min-h-8 items-center gap-1.5">
                          <span aria-hidden="true" className="w-3.5 shrink-0" />
                          {student.name}
                        </span>
                      )}
                    </Td>
                    <Td label="Status">
                      <StatusDot tone={meta.tone}>{meta.label}</StatusDot>
                    </Td>
                    <Td label="Marks" hidePhone={!attempt?.marks} className="text-right font-mono tabular-nums">
                      {attempt?.marks ? (
                        <span>
                          <span className="text-ink">
                            {attempt.marks.earned}/{attempt.marks.max}
                          </span>
                          {pct != null && <span className="ml-2 text-ink-3">{pct}%</span>}
                        </span>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td label="Time taken" hidePhone={!attempt?.submittedAt} className="text-right font-mono tabular-nums">
                      {attempt?.submittedAt ? clock(attempt.submittedAt - attempt.startedAt) : "—"}
                    </Td>
                    <Td label="Flags" hidePhone={!flags.count}>
                      {flags.count ? (
                        <FlagChip severity={flags.top}>
                          {flags.count} · {SEVERITY_LABEL[flags.top].toLowerCase()}
                        </FlagChip>
                      ) : (
                        <span className="text-ink-3">—</span>
                      )}
                    </Td>
                  </tr>
                  {expanded && attempt && (
                    <tr className="border-b border-rule bg-raised/30 last:border-b-0">
                      <td colSpan={5} className="p-0" id={`result-${student.id}`}>
                        <Detail attempt={attempt} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </TableShell>
      </section>

      <Bento className="mt-6 !py-4 text-[13px] text-ink-3">
        Marks count only confirmed answers. Written answers the AI drafted show as “Awaiting marks” until you confirm
        them in Grade review.
      </Bento>
    </div>
  );
};

export default TeacherTestResults;
