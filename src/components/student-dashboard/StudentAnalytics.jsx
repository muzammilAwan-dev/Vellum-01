import { TrendingUp, Users, Target } from "lucide-react";
import { useNavigate } from "react-router";
import { Bento, EmptyState, MetricCard, PageError, PageLoading, SectionHeader, Scope } from "@/components/common";
import { SmallMultiple } from "@/components/common/charts/SmallMultiple";
import { Spark } from "@/components/common/charts/Spark";
import { Trend } from "@/components/common/charts/Trend";
import { Button } from "@/components/ui/button";
import { useMyAnalytics } from "@/hooks/useAnalytics";
import { progressSentence } from "@/lib/analytics";
import { resolvePath } from "@/routes/paths";

const signed = (n) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}`;

// ═══════════════════════════════════════════════════════════════
// STUDENT ANALYTICS — real numbers from the student's released, fully graded
// tests (GET /analytics/me). `variant="dashboard"` is the compact home view;
// "progress" adds the topic profile and export.
// ═══════════════════════════════════════════════════════════════
export const StudentAnalytics = ({ variant = "progress" }) => {
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useMyAnalytics();
  if (isLoading) return <PageLoading />;
  if (error) return <PageError error={error} onRetry={refetch} />;

  const { trend, topics, summary } = data;
  const last = trend[trend.length - 1];
  const full = variant === "progress";

  return (
    <div className="mx-auto max-w-[1360px] px-5 py-6 tablet:px-10 tablet:py-8">
      <div className="mb-5 flex items-center gap-2 text-[13px] font-medium text-ink-3">
        {full ? "My progress" : "Overview"} <span className="text-ink-3">/</span> <Scope />
      </div>
      <div className="mb-8">
        <h1 className="font-serif text-[28px] font-semibold tablet:text-[34px] leading-[1.1] tracking-[-0.02em] text-ink">
          {full ? "Your progress" : "Welcome back"} <span className="text-ink-3">· <Scope /></span>
        </h1>
        <p className="mt-2 max-w-[640px] text-[14px] leading-relaxed text-ink-2">{progressSentence(summary)}</p>
        {summary.awaiting > 0 && (
          <p className="mt-1 max-w-[640px] text-[13px] text-ink-3">
            {summary.awaiting === 1 ? "1 test is" : `${summary.awaiting} tests are`} still being marked and isn't counted yet.
          </p>
        )}
      </div>

      {!last ? (
        <EmptyState
          title="No results yet"
          body="Once a test has been marked and its results are released, your scores and topic profile show up here."
          action="See my tests"
          onAction={() => navigate(resolvePath("student", "take"))}
        />
      ) : (
        <>
          <div className="bento mb-14">
            <MetricCard
              variant="featured"
              span="sm:col-span-2"
              icon={TrendingUp}
              iconTone="primary"
              label="Your average"
              value={summary.average}
              unit="%"
              delta={summary.changeSinceFirst != null ? `${signed(summary.changeSinceFirst)} since T1` : "First test"}
              deltaTone={summary.changeSinceFirst >= 0 || summary.changeSinceFirst == null ? "success" : "danger"}
              sparkline={<Spark data={trend.map((d) => d.you)} color="var(--color-primary)" height={32} />}
            />
            <MetricCard
              icon={Users}
              iconTone="neutral"
              label="Class average"
              value={last.class}
              unit="%"
              delta={
                summary.aheadOfClass === 0
                  ? "You're level"
                  : `You're ${Math.abs(summary.aheadOfClass)} pts ${summary.aheadOfClass > 0 ? "ahead" : "behind"}`
              }
              deltaTone={summary.aheadOfClass >= 0 ? "success" : "danger"}
            />
            {summary.strongest && (
              <MetricCard
                icon={Target}
                iconTone="success"
                label="Strongest topic"
                value={summary.strongest.name}
                delta={`${summary.strongest.accuracy}%`}
                deltaTone="success"
              />
            )}
          </div>

          <section className="mb-14">
            <SectionHeader label={`Your score vs. the class · T1 → T${trend.length}`} />
            <Bento>
              <div className="mb-1 text-[13px] font-semibold text-ink">You (solid) · Class average (dashed)</div>
              <div className="mb-5 text-[13px] text-ink-3">
                {trend.length > 1
                  ? `You were ahead of the class on ${summary.testsAhead} of ${trend.length} tests.`
                  : "Your first result. More tests will draw the trend."}
              </div>
              <Trend
                data={trend}
                focal={last.you}
                series={[
                  { key: "you", color: "var(--color-primary)", width: 2.4, label: "You" },
                  { key: "class", color: "var(--color-ink-3)", width: 1.4, dash: "4 4", label: "Class average" },
                ]}
              />
            </Bento>
          </section>

          {full && topics.length > 0 && (
            <section className="mb-14">
              <SectionHeader label="Your topic profile" />
              <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-px overflow-hidden rounded-[var(--radius-container)] border border-rule bg-rule">
                {[...topics].sort((a, b) => a.accuracy - b.accuracy).map((t) => (
                  <SmallMultiple key={t.name} topic={t} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <div className="no-print flex flex-wrap gap-2">
        {full && last && <Button onClick={() => window.print()}>Export as PDF</Button>}
        <Button
          variant={full ? "outline" : "default"}
          onClick={() => navigate(resolvePath("student", full ? "history" : "analytics"))}
        >
          {full ? "Full test history" : "See full progress"}
        </Button>
      </div>
    </div>
  );
};
