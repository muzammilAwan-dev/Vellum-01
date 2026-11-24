import { TrendingUp, Target, Users, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router";
import { Bento, Conn, MetricCard, Scope, SectionHeader } from "@/components/common";
import { InteractiveDotPlot } from "@/components/common/charts/InteractiveDotPlot";
import { Spark } from "@/components/common/charts/Spark";
import { DiscussionPreview } from "@/components/teacher-dashboard/DiscussionPreview";
import { LiveActivityFeed } from "@/components/teacher-dashboard/LiveActivityFeed";
import { useApp } from "@/context/useApp";
import { useToast } from "@/context/useToast";
import { useClassAnalytics } from "@/hooks/useAnalytics";
import { useGradeQueue } from "@/hooks/useGrading";
import { useTests } from "@/hooks/useTests";
import { classSentence, topicInsights } from "@/lib/analytics";
import { Badge } from "@/components/ui/badge";

// ═══════════════════════════════════════════════════════════════
// TEACHER HOME — bento grid layout
// ═══════════════════════════════════════════════════════════════
const TeacherDashboard = () => {
  const toast = useToast();
  const navigate = useNavigate();
  const { data: tests } = useTests();
  // Unpublished and not-yet-open tests, most recently edited first.
  const recentDrafts = tests
    .filter((t) => t.status === "draft" || t.status === "scheduled")
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 5);
  const { activeClassObj, activeSubject, user } = useApp();
  const { data: analytics } = useClassAnalytics({ classId: activeClassObj?.id, subjectId: activeSubject?.id });
  const { data: queue } = useGradeQueue();

  const trend = analytics?.trend ?? [];
  const topics = analytics?.topics ?? [];
  const summary = analytics?.summary;
  const insights = summary ? topicInsights(topics, { students: summary.studentsTotal, target: summary.target }) : [];
  const last = trend[trend.length - 1];

  const open = queue.filter((g) => g.status !== "reviewed");
  const pendingReviews = open.length;
  const lowConfidence = open.filter((g) => g.confidence === "low").length;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  // "Dr. R. Chen" → "Dr. Chen": drop middle initials
  const shortName = (user?.name ?? "").split(" ").filter((w) => !/^[A-Z]\.$/.test(w) || w === "Dr.").join(" ");

  return (
    <div className="mx-auto max-w-[1360px] px-5 py-6 tablet:px-10 tablet:py-8">
      <div className="mb-4 flex items-center gap-2 text-[13px] font-medium text-ink-3">
        <Scope />
        <span className="text-ink-3">/</span> Overview
      </div>

      {/* ── Header: title + live indicator ── */}
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-serif text-[28px] font-semibold tablet:text-[34px] leading-[1.1] tracking-[-0.02em] text-ink">
            {greeting}{shortName ? `, ${shortName}` : ""}
          </h1>
          <p className="mt-2 max-w-[640px] text-[14px] leading-relaxed text-ink-2">
            {analytics ? classSentence(summary) : " "}
          </p>
        </div>
      </div>

      {/* ── KPI row: four equal cards. Class average is the single featured one. ── */}
      <div className="bento">
        <MetricCard
          variant="featured"
          icon={TrendingUp}
          iconTone="primary"
          label="Class average"
          value={last?.class ?? "—"}
          unit={last ? "%" : undefined}
          delta={
            summary?.changeSinceFirst != null
              ? `${summary.changeSinceFirst > 0 ? "+" : summary.changeSinceFirst < 0 ? "−" : ""}${Math.abs(summary.changeSinceFirst)} since T1`
              : last ? "First test" : "No graded tests yet"
          }
          deltaTone={summary?.changeSinceFirst < 0 ? "danger" : "success"}
          onClick={() => navigate("/teacher/analytics")}
          sparkline={trend.length > 1 ? <Spark data={trend.map((d) => d.class)} color="var(--color-primary)" height={32} /> : undefined}
        />
        <MetricCard
          icon={Target}
          iconTone="danger"
          label="Weak topics"
          value={summary ? summary.belowTarget.length : "—"}
          unit={summary?.topicsTotal ? `of ${summary.topicsTotal}` : undefined}
          delta={summary?.belowTarget.length ? "Below target" : "On target"}
          deltaTone={summary?.belowTarget.length ? "danger" : "success"}
          onClick={() => navigate("/teacher/analytics")}
        />
        <MetricCard
          icon={Users}
          iconTone="warning"
          label="Students at risk"
          value={summary ? summary.studentsAtRisk : "—"}
          unit={summary ? `of ${summary.studentsTotal}` : undefined}
          delta={`Under ${summary?.target ?? 75}%`}
          deltaTone={summary?.studentsAtRisk ? "warning" : "success"}
          onClick={() => navigate("/teacher/analytics")}
        />
        <MetricCard
          icon={CheckCircle2}
          iconTone={pendingReviews > 0 ? "primary" : "success"}
          label="Pending reviews"
          value={pendingReviews}
          delta={lowConfidence > 0 ? `${lowConfidence} low confidence` : "All confident"}
          deltaTone={lowConfidence > 0 ? "warning" : "success"}
          onClick={() => navigate("/teacher/review")}
        />

        {/* ── Topic accuracy (3/4) + key findings (1/4) ── */}
        <Bento span="sm:col-span-2 lg:col-span-3" className="min-h-[340px]">
          <SectionHeader
            label="Topic accuracy"
            meta="Weakest first"
            action="Full analytics"
            onAction={() => navigate("/teacher/analytics")}
          />
          <div className="flex-1">
            {topics.length ? (
              <InteractiveDotPlot
                rows={topics}
                onDrillDown={(d) => {
                  toast.push(`Opening students struggling with ${d.topic}`, "info");
                  navigate("/teacher/analytics");
                }}
              />
            ) : (
              <p className="py-10 text-center text-[13.5px] text-ink-3">
                Topic accuracy appears once students have submitted and every mark is final.
              </p>
            )}
          </div>
        </Bento>

        <Bento span="sm:col-span-2 lg:col-span-1">
          <SectionHeader label="What matters" />
          <div className="flex flex-col gap-4">
            {insights.length === 0 && (
              <p className="text-[13px] leading-relaxed text-ink-3">Findings show up here once there is graded work.</p>
            )}
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

        {/* ── Recent drafts (2/4) · Live activity (1/4) · Discussion (1/4) ── */}
        <Bento span="sm:col-span-2">
          <SectionHeader label="Recent drafts" action="View all" onAction={() => navigate("/teacher/drafts")} />
          <ul className="-mx-2 flex flex-col">
            {recentDrafts.length === 0 && (
              <li className="px-2 py-3 text-[13px] text-ink-3">
                No drafts yet — create a test and it will show up here.
              </li>
            )}
            {recentDrafts.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/teacher/drafts/${r.id}`)}
                  className="group flex w-full items-center gap-3 rounded-lg px-2 py-3 text-left transition-colors hover:bg-raised"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-medium text-ink">{r.title}</div>
                    <div className="mt-0.5 truncate text-[12.5px] text-ink-3">
                      {r.subject} · {r.cls} · {r.questions} questions · {r.marks} marks
                    </div>
                  </div>
                  <Badge variant={r.mode === "personal" ? "primary" : "neutral"}>{r.mode === "personal" ? "Per student" : "Whole class"}</Badge>
                </button>
              </li>
            ))}
          </ul>
        </Bento>

        <Bento span="sm:col-span-1">
          <SectionHeader label="Live activity" aside={<Conn state="live" />} />
          <LiveActivityFeed />
        </Bento>

        <Bento span="sm:col-span-1">
          <SectionHeader label="Discussion" action="View all" onAction={() => navigate("/teacher/chat")} />
          <DiscussionPreview onOpenAll={() => navigate("/teacher/chat")} />
        </Bento>
      </div>
    </div>
  );
};

export default TeacherDashboard;
