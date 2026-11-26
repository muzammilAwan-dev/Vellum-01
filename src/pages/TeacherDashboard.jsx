import { AlertTriangle, ArrowRight, CheckCircle2, ClipboardCheck, FileEdit, Plus, Radio, Target, TrendingUp, Users } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { Bento, MetricCard, PageHeader, Scope, SectionHeader } from "@/components/common";
import { InteractiveDotPlot } from "@/components/common/charts/InteractiveDotPlot";
import { Spark } from "@/components/common/charts/Spark";
import { DiscussionPreview } from "@/components/teacher-dashboard/DiscussionPreview";
import { useApp } from "@/context/useApp";
import { useClassAnalytics } from "@/hooks/useAnalytics";
import { useGradeQueue } from "@/hooks/useGrading";
import { useNow } from "@/hooks/useNow";
import { useTests } from "@/hooks/useTests";
import { classSentence, topicInsights } from "@/lib/analytics";
import { cn } from "@/lib/cn";
import { buildTeacherToday, greetingFor, shortName } from "@/lib/teacherHome";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// Icon + colour per kind of "Today" item. Colour is never the only signal: each has its own icon.
const TONE = {
  live: { Icon: Radio, box: "bg-primary text-on-primary", ring: "border-primary/30" },
  danger: { Icon: AlertTriangle, box: "bg-danger-dim text-danger", ring: "border-danger/30" },
  attention: { Icon: AlertTriangle, box: "bg-warning-dim text-warning", ring: "border-warning/30" },
  info: { Icon: ClipboardCheck, box: "bg-primary-dim text-primary", ring: "border-rule" },
};
const ICON_FOR = { review: ClipboardCheck, drafts: FileEdit, "at-risk": Users };

// ═══════════════════════════════════════════════════════════════
// TEACHER HOME — "Today": what needs you (real data, most urgent first), then how the class is
// doing in the active subject. Nothing on this page is decoration: no fake feed, no fake "live".
// ═══════════════════════════════════════════════════════════════
const TeacherDashboard = () => {
  const navigate = useNavigate();
  const now = useNow(60_000);
  const { data: tests } = useTests();
  const { activeClassObj, activeSubject, user } = useApp();
  const { data: analytics } = useClassAnalytics({ classId: activeClassObj?.id, subjectId: activeSubject?.id });
  const { data: queue } = useGradeQueue();

  const trend = analytics?.trend ?? [];
  const topics = analytics?.topics ?? [];
  const summary = analytics?.summary;
  const insights = summary ? topicInsights(topics, { students: summary.studentsTotal, target: summary.target }) : [];
  const last = trend[trend.length - 1];
  const today = buildTeacherToday({ tests, queue, analytics, now });

  // Unpublished and not-yet-open tests, most recently edited first.
  const recentDrafts = tests
    .filter((t) => t.status === "draft" || t.status === "scheduled")
    .sort((a, b) => new Date(b.updatedAt ?? 0) - new Date(a.updatedAt ?? 0))
    .slice(0, 4);

  const name = shortName(user?.name ?? "");

  return (
    <div className="mx-auto max-w-[1360px] px-5 py-6 tablet:px-10 tablet:py-8">
      <PageHeader
        crumbs={[{ label: <Scope /> }, { label: "Overview" }]}
        title={`${greetingFor(new Date(now).getHours())}${name ? `, ${name}` : ""}`}
        intro={analytics ? classSentence(summary) : " "}
        actions={
          <Button onClick={() => navigate("/teacher/drafts/new")}>
            <Plus size={14} aria-hidden="true" /> New test
          </Button>
        }
      />

      {/* ── Today: what needs you ── */}
      <section className="mb-10" aria-labelledby="today-heading">
        <SectionHeader label={<span id="today-heading">Today</span>} meta={today.length ? `${today.length} ${today.length === 1 ? "thing needs" : "things need"} you` : undefined} />
        {today.length === 0 ? (
          <Bento className="flex-row flex-wrap items-center gap-3 !py-5">
            <CheckCircle2 size={20} aria-hidden="true" className="shrink-0 text-success" />
            <p className="min-w-0 flex-1 text-[14px] text-ink-2">Nothing is waiting for you. Every mark is reviewed and no test is running.</p>
            <Button variant="outline" onClick={() => navigate("/teacher/drafts/new")}>Make a test</Button>
          </Bento>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {today.map((it) => {
              const t = TONE[it.tone] ?? TONE.info;
              const Icon = it.tone === "live" ? Radio : ICON_FOR[it.id] ?? t.Icon;
              return (
                <li key={it.id}>
                  <Link
                    to={it.to}
                    className={cn(
                      "group flex items-center gap-3.5 rounded-[var(--radius-bento)] border bg-surface px-4 py-3.5 shadow-[var(--shadow-card)] transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-rule-3 hover:shadow-[var(--shadow-raised)] focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:hover:translate-y-0",
                      t.ring,
                    )}
                  >
                    <span aria-hidden="true" className={cn("grid size-10 shrink-0 place-items-center rounded-xl", t.box, it.tone === "live" && "motion-safe:animate-pulse")}>
                      <Icon size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14.5px] font-semibold leading-snug text-ink [overflow-wrap:anywhere]">{it.title}</span>
                      <span className="mt-0.5 block text-[13px] leading-snug text-ink-2">{it.detail}</span>
                    </span>
                    <span className="hidden shrink-0 items-center gap-1 whitespace-nowrap text-[13px] font-semibold text-primary narrow:inline-flex">
                      {it.cta}
                      <ArrowRight size={14} aria-hidden="true" className="transition-transform group-hover:translate-x-0.5" />
                    </span>
                    <ArrowRight size={16} aria-hidden="true" className="shrink-0 text-ink-3 narrow:hidden" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── How the class is doing (active subject) ── */}
      <section className="mb-10">
        <SectionHeader label="How the class is doing" meta={activeSubject && activeClassObj ? `${activeSubject.name} · ${activeClassObj.short}` : undefined} action="Full analytics" onAction={() => navigate("/teacher/analytics")} />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-4">
          <div className="col-span-2 flex lg:col-span-1 [&>*]:flex-1">
            <MetricCard
              variant="featured"
              icon={TrendingUp}
              iconTone="primary"
              label="Class average"
              value={last?.class ?? "—"}
              unit={last ? "%" : undefined}
              delta={
                summary?.changeSinceFirst != null
                  ? `${summary.changeSinceFirst > 0 ? "+" : summary.changeSinceFirst < 0 ? "−" : ""}${Math.abs(summary.changeSinceFirst)} since the first test`
                  : last ? "First test" : "No graded tests yet"
              }
              deltaTone={summary?.changeSinceFirst < 0 ? "danger" : "success"}
              onClick={() => navigate("/teacher/analytics")}
              sparkline={trend.length > 1 ? <Spark data={trend.map((d) => d.class)} color="var(--color-primary)" height={32} /> : undefined}
            />
          </div>
          <MetricCard
            icon={Target}
            iconTone={summary?.belowTarget.length ? "danger" : "success"}
            label="Topics below target"
            value={summary ? summary.belowTarget.length : "—"}
            unit={summary?.topicsTotal ? `of ${summary.topicsTotal}` : undefined}
            delta={summary?.belowTarget.length ? `Weakest: ${summary.belowTarget[0]}` : "All on target"}
            deltaTone={summary?.belowTarget.length ? "danger" : "success"}
            onClick={() => navigate("/teacher/analytics#topics")}
          />
          <MetricCard
            icon={Users}
            iconTone={summary?.studentsAtRisk ? "warning" : "success"}
            label={`Students under ${summary?.target ?? 75}%`}
            value={summary ? summary.studentsAtRisk : "—"}
            unit={summary ? `of ${summary.studentsTotal}` : undefined}
            delta={summary?.studentsAtRisk ? "See who" : "Everyone on target"}
            deltaTone={summary?.studentsAtRisk ? "warning" : "success"}
            onClick={() => navigate("/teacher/analytics?show=at-risk")}
          />
        </div>
      </section>

      {/* ── Topic accuracy (2/3) + what matters (1/3) ── */}
      <section className="mb-10 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Bento className="min-h-[300px] min-w-0">
          <SectionHeader label="Topic accuracy" meta="weakest first" />
          <div className="min-w-0 flex-1">
            {topics.length ? (
              <InteractiveDotPlot rows={topics} onDrillDown={() => navigate("/teacher/analytics#topics")} />
            ) : (
              <p className="py-10 text-center text-[13.5px] text-ink-3">Topic accuracy appears once students have submitted and every mark is final.</p>
            )}
          </div>
        </Bento>

        <Bento className="min-w-0">
          <SectionHeader label="What matters" />
          <div className="flex flex-col gap-4">
            {insights.length === 0 && <p className="text-[13px] leading-relaxed text-ink-3">Findings show up here once there is graded work.</p>}
            {insights.map((it, k) => (
              <div key={it.name} className={k ? "border-t border-rule pt-4" : ""}>
                <div className="mb-1 text-[14px] font-semibold text-ink">{it.name}</div>
                <div className="text-[13px] leading-relaxed text-ink-2">
                  {it.kind === "rest" ? "At or above" : it.kind === "weakest" ? "Weakest at" : "Sits at"}{" "}
                  <span className={`font-semibold ${it.tone === "danger" ? "text-danger" : it.tone === "warning" ? "text-warning" : "text-success"}`}>{it.accuracy}%</span>. {it.detail}.
                </div>
              </div>
            ))}
          </div>
        </Bento>
      </section>

      {/* ── Coming up (drafts + scheduled) · Discussion ── */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Bento className="min-w-0">
          <SectionHeader label="Drafts and scheduled" action="All tests" onAction={() => navigate("/teacher/drafts")} />
          <ul className="-mx-2 flex flex-col">
            {recentDrafts.length === 0 && <li className="px-2 py-3 text-[13px] text-ink-3">No drafts. Make a test and it shows up here.</li>}
            {recentDrafts.map((r) => (
              <li key={r.id}>
                <Link
                  to={`/teacher/drafts/${r.id}`}
                  className="group flex w-full items-center gap-3 rounded-lg px-2 py-3 text-left transition-colors hover:bg-raised focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-medium text-ink [overflow-wrap:anywhere]">{r.title}</span>
                    <span className="mt-0.5 block text-[12.5px] text-ink-3">
                      {r.status === "scheduled" ? "Scheduled" : "Draft"} · {r.subject} · {r.cls} · {r.questions} questions · {r.marks} marks
                    </span>
                  </span>
                  <Badge variant={r.mode === "personal" ? "primary" : "neutral"}>{r.mode === "personal" ? "Per student" : "Whole class"}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Bento>

        <Bento className="min-w-0">
          <SectionHeader label="Discussion" meta="open threads" action="View all" onAction={() => navigate("/teacher/chat")} />
          <DiscussionPreview onOpenAll={() => navigate("/teacher/chat")} />
        </Bento>
      </section>
    </div>
  );
};

export default TeacherDashboard;
