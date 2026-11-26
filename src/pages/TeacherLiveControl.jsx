import { useEffect, useMemo, useState } from "react";
import { Clock, StopCircle } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";
import { extendTest, stopTestNow } from "@/api/tests";
import {
  Bento,
  EmptyState,
  PageError,
  PageHeader,
  PageLoading,
  Scope,
  SectionHeader,
  StatusDot,
  TableShell,
  Td,
  Th,
} from "@/components/common";
import { NumberStepper } from "@/components/common/NumberStepper";
import { useApp } from "@/context/useApp";
import { useToast } from "@/context/useToast";
import { useTestRoster } from "@/hooks/useAttempts";
import { useTests } from "@/hooks/useTests";
import { getSettings, RELEASE_LABELS } from "@/lib/testSettings";
import { formatDateTime } from "@/lib/time";
import { Button } from "@/components/ui/button";

const LiveTestView = ({ test }) => {
  const toast = useToast();
  const navigate = useNavigate();
  const { setConfirmState } = useApp();
  const { data: roster = [], isLoading: rosterLoading, error: rosterError, refetch: refetchRoster } =
    useTestRoster(test.id);
  const [now, setNow] = useState(() => Date.now());
  const [stopping, setStopping] = useState(false);
  const [extendBy, setExtendBy] = useState(10);

  const running = test.status === "live";
  const ended = test.status === "completed";

  // Re-render for the countdown. The roster itself refreshes from the server
  // every 20 s (see useTestRoster).
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  // One row per student in the class; the server says who has started and how
  // far they are (answers themselves are never sent to the teacher here).
  const rows = useMemo(
    () =>
      roster.map(({ student, attempt }) => {
        const flagEvents = attempt?.flags ?? [];
        let status = "waiting";
        if (attempt?.status === "submitted") status = "submitted";
        else if (attempt?.clientSilent) status = "silent";
        else if (attempt) status = ended ? "submitting" : "working";
        return {
          name: student.name,
          status,
          answered: attempt?.progress.answered ?? 0,
          total: attempt?.progress.total ?? 0,
          flags: flagEvents.length,
          lastFlag: flagEvents.at(-1)?.at ?? null,
        };
      }),
    [roster, ended],
  );

  if (rosterLoading) return <PageLoading />;
  if (rosterError) return <PageError error={rosterError} onRetry={refetchRoster} />;

  const working = rows.filter((r) => ["working", "submitting", "silent"].includes(r.status)).length;
  const done = rows.filter((r) => r.status === "submitted").length;
  const waiting = rows.filter((r) => r.status === "waiting").length;
  const flagged = rows.filter((r) => r.flags > 0).length;
  const closes = test.schedule?.availableUntil ?? null;
  const minutesLeft = closes ? Math.max(0, Math.ceil((closes - now) / 60_000)) : null;
  const settings = getSettings(test);

  const stop = () =>
    setConfirmState({
      title: `Stop "${test.title}" now?`,
      message:
        "Every student still working is submitted automatically within about 20 seconds.",
      confirmLabel: "Stop test",
      onConfirm: async () => {
        setStopping(true);
        try {
          await stopTestNow(test.id);
          toast.push("Test stopped — answers are being submitted", "info");
        } catch (err) {
          toast.push(err?.message || "Couldn't stop the test — try again", "error");
        } finally {
          setStopping(false);
        }
      },
    });

  const extend = async () => {
    try {
      await extendTest(test.id, extendBy);
      toast.push(`Extended by ${extendBy} minutes`, "success");
    } catch (err) {
      toast.push(err?.message || "Couldn't extend the test — try again", "error");
    }
  };

  // One honest sentence built from the numbers (never "students are working" when nobody is).
  const sentence = ended
    ? `This test has ended. ${done} of ${rows.length} submitted.`
    : working === 0 && done === 0
      ? `Nobody has started yet: ${waiting} of ${rows.length} students haven't opened it.`
      : `${working} working, ${done} submitted, ${waiting} not started.`;
  const statusTone = (r) =>
    r.status === "submitted" ? "success" : r.status === "working" ? "live" : r.status === "submitting" ? "warning" : r.status === "silent" ? "danger" : "muted";
  const STATUS_TEXT = { submitted: "Submitted", working: "Working", submitting: "Submitting…", silent: "No signal", waiting: "Not started" };

  return (
    <div className="mx-auto max-w-[1360px] px-5 py-6 tablet:px-10 tablet:py-8">
      <PageHeader
        crumbs={[{ label: `${test.subject} · ${test.cls}` }, { label: "Live test" }]}
        title={test.title}
        titleNote={running ? <StatusDot tone="live">Live</StatusDot> : <StatusDot tone="muted">Ended</StatusDot>}
        intro={
          <>
            {sentence} Results: {RELEASE_LABELS[settings.release].toLowerCase()} · {settings.aiGrading ? "AI drafts written marks" : "written answers graded by hand"}.
          </>
        }
      />

      {/* The controls that matter sit right under the title, before the roster (sticky on phones). */}
      {running ? (
        <section
          aria-label="Test controls"
          className="sticky top-[72px] z-10 mb-6 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[var(--radius-bento)] border border-primary/25 bg-surface/95 px-4 py-3 shadow-[var(--shadow-raised)] backdrop-blur-sm"
        >
          <div className="flex min-w-0 items-center gap-2 text-[13.5px] font-medium text-ink">
            <Clock size={15} aria-hidden="true" className="shrink-0 text-primary" />
            <span aria-live="polite">
              {minutesLeft != null ? `${minutesLeft} min left · closes ${formatDateTime(closes)}` : "No end time: open until you stop it"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 tablet:ml-auto">
            <NumberStepper value={extendBy} onChange={setExtendBy} min={1} max={60} suffix="min" label="Minutes to add" />
            <Button onClick={extend} variant="outline">
              Extend
            </Button>
            <Button onClick={stop} disabled={stopping} variant="destructive">
              <StopCircle size={14} aria-hidden="true" />
              {stopping ? "Stopping…" : "Stop for everyone"}
            </Button>
          </div>
        </section>
      ) : (
        <div className="mb-6 flex flex-wrap gap-2 max-narrow:[&>*]:flex-auto">
          <Button onClick={() => navigate(`/teacher/results/${test.id}`)}>View results</Button>
          <Button onClick={() => navigate("/teacher/review")} variant="outline">
            Review marks
          </Button>
          <Button onClick={() => navigate("/teacher/drafts")} variant="outline">
            Back to tests
          </Button>
        </div>
      )}

      <section className="mb-8">
        <SectionHeader
          label="Class roster"
          meta={`${rows.length} students · refreshes every 20 s`}
          aside={flagged > 0 ? <span className="text-[12.5px] font-medium text-warning">{flagged} with flagged events</span> : null}
        />
        <TableShell stack label="Class roster">
          <thead>
            <tr className="border-b border-rule-2">
              <Th>Student</Th>
              <Th className="text-right">Progress</Th>
              <Th>Status</Th>
              <Th className="text-right">Flags</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-b border-rule transition-colors last:border-b-0 hover:bg-raised/50">
                <Td className="text-[13.5px] font-medium text-ink">{r.name}</Td>
                <Td label="Progress" hidePhone={r.total === 0} className="text-right font-mono tabular-nums">
                  {r.total > 0 ? (
                    <div className="ml-auto flex items-center justify-end gap-2">
                      <span aria-hidden="true" className="h-1 w-16 overflow-hidden rounded-full bg-rule">
                        <span className="block h-full rounded-full bg-gradient-to-r from-primary to-primary-2" style={{ width: `${(r.answered / r.total) * 100}%` }} />
                      </span>
                      <span>
                        {r.answered}/{r.total}
                        <span className="sr-only"> answered</span>
                      </span>
                    </div>
                  ) : (
                    <span aria-label="Nothing answered yet">—</span>
                  )}
                </Td>
                <Td label="Status">
                  <StatusDot tone={statusTone(r)}>{STATUS_TEXT[r.status]}</StatusDot>
                </Td>
                <Td label="Flags" hidePhone={!r.flags} className="text-right font-mono">
                  {r.flags ? (
                    <span title={r.lastFlag ? `Last: ${formatDateTime(r.lastFlag)}` : undefined} className="whitespace-nowrap rounded-full bg-warning-dim px-2 py-0.5 text-[12px] font-semibold text-warning">
                      {r.flags}
                      <span className="sr-only"> {r.flags === 1 ? "flag" : "flags"}</span>
                    </span>
                  ) : (
                    <span aria-label="No flags">—</span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
        {running && <p className="mt-3 text-[12.5px] text-ink-3">Students submit automatically when their time runs out. "No signal" means the browser stopped checking in for over a minute: a clue, not proof.</p>}
      </section>
    </div>
  );
};

// The page frame + h1 for the states without a single test (none live, several, not found).
const LivePageShell = ({ intro, children }) => (
  <div className="mx-auto max-w-[1360px] px-5 py-6 tablet:px-10 tablet:py-8">
    <PageHeader crumbs={[{ label: <Scope /> }, { label: "Live test" }]} title="Live test" intro={intro} />
    {children}
  </div>
);

const TeacherLiveControl = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { data: tests, isLoading, error, refetch } = useTests();
  const liveTests = tests.filter((t) => t.status === "live");
  const requested = params.get("test");

  if (isLoading) return <PageLoading />;
  if (error) return <PageError error={error} onRetry={refetch} />;

  if (requested) {
    const test = tests.find((t) => t.id === requested);
    if (test && (test.status === "live" || test.status === "completed")) {
      return <LiveTestView key={test.id} test={test} />;
    }
    return (
      <LivePageShell>
      <EmptyState
        title={test ? "This test isn't live" : "Test not found"}
        body={
          test
            ? "It hasn't opened yet, or hasn't been published."
            : "It may have been deleted."
        }
        action="Back to tests"
        onAction={() => navigate("/teacher/drafts")}
      />
      </LivePageShell>
    );
  }

  if (liveTests.length === 1) return <LiveTestView key={liveTests[0].id} test={liveTests[0]} />;

  if (liveTests.length === 0) {
    return (
      <LivePageShell>
      <EmptyState
        title="No test is live right now"
        body="Publish a test, or start a scheduled one early, and you can monitor it here."
        action="Go to tests"
        onAction={() => navigate("/teacher/drafts")}
      />
      </LivePageShell>
    );
  }

  return (
    <LivePageShell intro="More than one test is open. Pick one to monitor.">
      <Bento>
        <ul>
          {liveTests.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between gap-3 border-b border-rule py-4 last:border-b-0"
            >
              <div>
                <div className="text-[14.5px] font-medium text-ink">{t.title}</div>
                <div className="text-[12.5px] text-ink-3">
                  {t.subject} · {t.cls} · {t.questions} questions
                </div>
              </div>
              <Button onClick={() => setParams({ test: t.id })}>Monitor</Button>
            </li>
          ))}
        </ul>
      </Bento>
    </LivePageShell>
  );
};

export default TeacherLiveControl;
