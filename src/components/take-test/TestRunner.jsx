import { useCallback, useEffect, useRef, useState, useLayoutEffect } from "react";
import { Check } from "lucide-react";
import { LIVE_STATUS_INTERVAL_MS, getLiveStatus } from "@/api/tests";
import { saveAnswer, submitAttempt } from "@/api/attempts";
import { ConfirmDialog, Conn, InstitutionMark } from "@/components/common";
import { AutoSaveIndicator } from "./AutoSaveIndicator";
import { QuestionNavigator } from "./QuestionNavigator";
import { StopTestOverlay } from "./StopTestOverlay";
import { useToast } from "@/context/useToast";
import { useAntiCheat } from "@/hooks/useAntiCheat";
import { FLAG_TYPES } from "@/lib/antiCheat";
import { cn } from "@/lib/cn";
import { isChoice, typeLabel } from "@/lib/questions";
import { isAnswered } from "@/lib/attempts";
import { getSettings } from "@/lib/testSettings";
import { Button } from "@/components/ui/button";

// The live test: one question at a time. Everything the student does is
// written to the attempt (answers, anti-cheat flags), so a refresh or a
// crash loses nothing, and the countdown comes from the attempt's fixed
// deadline rather than a local counter.
export const TestRunner = ({ test, attempt, questions, onSubmitted }) => {
  const toast = useToast();
  // The toast context value changes whenever a toast appears; keeping it in a
  // ref keeps `finish` (and the stop overlay's countdown) stable.
  const toastRef = useRef(toast);
  useLayoutEffect(() => {
    toastRef.current = toast;
  }, [toast]);
  const [qIndex, setQIndex] = useState(1);
  const [now, setNow] = useState(() => Date.now());
  // Answers live in this component; saving them to the server is a
  // best-effort backup and the full map is sent again on submit. That keeps
  // typing smooth and correct whatever the network (or a real backend) does.
  const [answers, setAnswers] = useState(() => attempt.answers ?? {});
  const answersRef = useRef(answers);
  useLayoutEffect(() => {
    answersRef.current = answers;
  }, [answers]);
  const pending = useRef(new Map());
  const [deadline, setDeadline] = useState(attempt.deadline);
  // Everything flagged so far (the server keeps the full list; this is the count).
  const [flagCount, setFlagCount] = useState(() => attempt.flags.length);
  const [stopped, setStopped] = useState(false);
  const [conn, setConn] = useState("live");
  const [saveState, setSaveState] = useState("saved");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const finishing = useRef(false);
  const flushTimer = useRef(null);

  const { allowBack, requireFullscreen, blockCopyPaste } = getSettings(test);
  const total = questions.length;
  const q = questions[qIndex - 1];
  const answered = new Set(
    questions.flatMap((qq, i) => (isAnswered(qq, answers[qq.id]) ? [i + 1] : [])),
  );
  const unanswered = total - answered.size;

  // Anti-cheat: report tab switches, fullscreen exits, blocked copy/paste, etc.
  // Blocked actions get a short toast so the student knows why nothing happened.
  const { fullscreen, reenterFullscreen, finishTest } = useAntiCheat({
    testId: test.id,
    active: !stopped,
    requireFullscreen,
    blockCopyPaste,
    onFlag: (type) => {
      setFlagCount((n) => n + 1);
      if (["right-click", "copy", "cut", "paste"].includes(type))
        toastRef.current.push("Copying, pasting and the right-click menu are turned off during this test", "info", { duration: 2500 });
      else if (type === "fullscreen-exit")
        toastRef.current.push("You left fullscreen — this has been recorded", "info", { duration: 3500 });
      else if (type === "tab-switch" || type === "window-blur")
        toastRef.current.push(`${FLAG_TYPES[type].label} — this has been recorded`, "info", { duration: 3500 });
    },
  });

  const finish = useCallback(
    async (reason) => {
      if (finishing.current) return;
      finishing.current = true;
      try {
        clearTimeout(flushTimer.current);
        const result = await submitAttempt(test.id, { reason, answers: answersRef.current });
        finishTest(); // stop watching, hand back the screen (not reported)
        onSubmitted?.(result);
      } catch (err) {
        finishing.current = false;
        toastRef.current.push(err?.message || "Couldn't submit — try again", "error");
      }
    },
    [test.id, onSubmitted, finishTest],
  );
  const forceSubmit = useCallback(() => finish("stopped"), [finish]);

  // Countdown from the fixed deadline; auto-submit at zero.
  const remaining = Math.max(0, Math.ceil((deadline - now) / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (remaining === 0) finish("timeout");
  }, [remaining, finish]);

  // §7.7 polling: ask the backend whether the teacher stopped the test.
  useEffect(() => {
    if (stopped) return;
    let cancelled = false;
    const poll = async () => {
      setConn("polling");
      try {
        const status = await getLiveStatus(test.id);
        if (cancelled) return;
        if (status.stopped) setStopped(true);
        // The teacher can extend time; the server tells us our new deadline.
        if (status.deadline) setDeadline(status.deadline);
      } catch {
        /* a missed poll is fine; the next one retries */
      } finally {
        if (!cancelled) setConn("live");
      }
    };
    poll();
    const t = setInterval(poll, LIVE_STATUS_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [test.id, stopped]);

  // Named so the retry below can call itself without referring to `flush` before it exists.
  const flush = useCallback(async function flushAnswers() {
    clearTimeout(flushTimer.current);
    const batch = [...pending.current.entries()];
    pending.current.clear();
    if (batch.length === 0) return;
    try {
      await Promise.all(batch.map(([qid, value]) => saveAnswer(attempt.id, qid, value)));
      setSaveState(pending.current.size > 0 ? "saving" : "saved");
    } catch {
      // Keep what failed (unless a newer edit replaced it) and try again.
      batch.forEach(([qid, value]) => {
        if (!pending.current.has(qid)) pending.current.set(qid, value);
      });
      setSaveState("error");
      flushTimer.current = setTimeout(flushAnswers, 4000);
    }
  }, [attempt.id]);

  // Leaving the page mid-test: send whatever is still waiting.
  useEffect(() => () => void flush(), [flush]);

  const setAnswer = (value) => {
    setAnswers((prev) => ({ ...prev, [q.id]: value }));
    pending.current.set(q.id, value);
    setSaveState("saving");
    clearTimeout(flushTimer.current);
    // Choices save at once; typing waits for a pause.
    flushTimer.current = setTimeout(flush, isChoice(q) ? 100 : 500);
  };

  if (!q) {
    return (
      <div className="grid min-h-dvh place-items-center bg-bg p-6 text-center text-[14px] text-ink-2">
        This test has no questions.
      </div>
    );
  }

  const current = answers[q.id];
  const choice = isChoice(q);
  const locked = stopped;
  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  const warn = remaining < 5 * 60;

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-rule bg-bg/80 px-4 py-3 backdrop-blur-xl tablet:px-8">
        <div className="flex min-w-0 items-center gap-3.5">
          <span className="grid size-7 shrink-0 place-items-center text-primary">
            <InstitutionMark size={28} />
          </span>
          <div className="min-w-0 truncate font-display text-[14.5px] font-semibold tracking-[-0.01em] text-ink">
            {test.title}
          </div>
          <span className="hidden shrink-0 whitespace-nowrap rounded-full border border-rule-2 bg-surface/60 px-2 py-0.5 text-[12px] font-medium text-ink-2 narrow:inline">
            {test.subject} · {test.cls}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <div className="hidden items-center gap-2.5 text-[13px] font-medium text-ink-3 tablet:flex">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2 py-1",
                flagCount > 0
                  ? "border-danger/30 bg-danger-dim text-danger"
                  : "border-rule bg-surface/60 text-ink-3",
              )}
            >
              <span
                className={cn("size-1.5 rounded-full", flagCount > 0 ? "bg-danger" : "bg-success")}
              />
              {flagCount === 0
                ? "Focus held"
                : `${flagCount} flagged event${flagCount > 1 ? "s" : ""}`}
            </span>
            <Conn state={conn} />
          </div>
          <div
            className={cn(
              "font-display text-[18px] font-semibold tabular-nums tracking-[-0.01em] transition-colors",
              warn ? "text-danger" : "text-ink",
            )}
            role="timer"
            aria-label={`${mm} minutes ${ss} seconds remaining`}
          >
            {mm}:{ss}
          </div>
          <Button size="sm" variant="outline" disabled={locked} onClick={() => setConfirmOpen(true)}>
            Submit
          </Button>
        </div>
      </header>

      {requireFullscreen && !fullscreen && !stopped && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 border-b border-warning/30 bg-warning-dim px-4 py-2.5 text-[13px] font-medium text-warning"
        >
          <span>This test is meant to be taken in fullscreen (F11 works too). Leaving fullscreen is recorded.</span>
          <Button size="sm" variant="outline" onClick={reenterFullscreen}>
            Return to fullscreen
          </Button>
        </div>
      )}

      <main className="flex flex-1 items-start justify-center px-4 py-10 tablet:px-8 tablet:py-14">
        <div className="w-full max-w-[680px]">
          <div className="mb-8 flex gap-1">
            {questions.map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-0.5 flex-1 rounded-sm transition-colors duration-300",
                  i + 1 < qIndex
                    ? "bg-primary/60"
                    : i + 1 === qIndex
                      ? "bg-gradient-to-r from-primary to-primary-2 shadow-[0_0_8px_var(--color-primary-dim)]"
                      : "bg-rule",
                )}
              />
            ))}
          </div>

          <div className="mb-4 flex items-center justify-between text-[13px] font-medium text-ink-3">
            <span>
              Question {qIndex} of {total} · {typeLabel(q.type)}
            </span>
            <span>{q.marks} marks</span>
          </div>

          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <AutoSaveIndicator state={saveState} />
            <QuestionNavigator
              total={total}
              current={qIndex}
              answered={answered}
              onJump={(n) => (allowBack || n >= qIndex) && setQIndex(n)}
            />
          </div>

          <div className="mb-8 font-display text-[26px] leading-snug tracking-[-0.015em] text-ink tablet:text-[30px]">
            {q.text}
          </div>

          {choice && q.options && (
            <div className="flex flex-col gap-2">
              {q.options.map((o, i) => (
                <button
                  key={i}
                  disabled={locked}
                  onClick={() => setAnswer(i)}
                  aria-pressed={current === i}
                  className={cn(
                    "group flex w-full items-center gap-4 rounded-[var(--radius-container)] border bg-surface px-5 py-4 text-left text-[15px] text-ink transition-all duration-200 disabled:cursor-not-allowed",
                    current === i
                      ? "border-primary bg-primary-soft shadow-[var(--shadow-primary)]"
                      : "border-rule-2 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[var(--shadow-raised)]",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-6.5 shrink-0 place-items-center rounded-full font-mono text-[12px] font-semibold transition-all duration-200",
                      current === i
                        ? "bg-primary text-on-primary"
                        : "bg-raised group-hover:bg-primary-dim group-hover:text-primary",
                    )}
                  >
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span>{o}</span>
                </button>
              ))}
            </div>
          )}

          {!choice && (
            <textarea
              key={q.id}
              disabled={locked}
              placeholder="Write your answer here…"
              value={typeof current === "string" ? current : ""}
              onChange={(e) => setAnswer(e.target.value)}
              className="min-h-[180px] w-full resize-y rounded-[var(--radius-container)] border border-rule-2 bg-surface px-4 py-3.5 text-[15px] leading-relaxed text-ink outline-none transition-all placeholder:text-ink-3 focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed"
            />
          )}

          <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
            {allowBack ? (
              <Button
                disabled={qIndex === 1 || locked}
                onClick={() => setQIndex(qIndex - 1)}
                variant="ghost"
              >
                ← Previous
              </Button>
            ) : (
              <span />
            )}
            <span className="hidden items-center gap-1.5 text-[13px] font-medium text-ink-3 narrow:inline-flex">
              {isAnswered(q, current)
                ? (<><Check size={14} aria-hidden /> Answer recorded</>)
                : choice
                  ? "Select an answer"
                  : "Type your answer"}
            </span>
            <Button
              disabled={locked}
              onClick={() => (qIndex === total ? setConfirmOpen(true) : setQIndex(qIndex + 1))}
            >
              {qIndex === total ? "Submit test" : "Next →"}
            </Button>
          </div>
        </div>
      </main>

      <ConfirmDialog
        open={confirmOpen}
        tone="info"
        title="Submit your test?"
        message={
          unanswered > 0
            ? `${unanswered} ${unanswered === 1 ? "question is" : "questions are"} still unanswered. Once you submit, you can't change your answers.`
            : "Once you submit, you can't change your answers."
        }
        confirmLabel="Submit test"
        cancelLabel="Keep working"
        onConfirm={() => finish("manual")}
        onClose={() => setConfirmOpen(false)}
      />

      <StopTestOverlay
        visible={stopped}
        onForceSubmit={forceSubmit}
        reason="The teacher has stopped this test for everyone."
      />
    </div>
  );
};
