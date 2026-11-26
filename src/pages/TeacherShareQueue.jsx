import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { EmptyState, PageHeader, PageLoading, Scope } from "@/components/common";
import { SendQueue } from "@/components/teacher-report/SendQueue";
import { useApp } from "@/context/useApp";
import { useClassAnalytics } from "@/hooks/useAnalytics";
import { useProfile } from "@/hooks/useProfile";
import { loadQueue } from "@/lib/shareQueue";
import { normalizeSummaryPrefs } from "@/lib/summary";

// ═══════════════════════════════════════════════════════════════
// /teacher/analytics/share — the send queue. Made by the share dialog, which saves the batch of report
// snapshots in sessionStorage (lib/shareQueue.js), so a reload keeps it; with nothing saved the page sends the
// teacher back to start from a student or the class table.
// ═══════════════════════════════════════════════════════════════
const TeacherShareQueue = () => {
  const navigate = useNavigate();
  const [queue] = useState(loadQueue);
  const { activeClassObj, activeSubject } = useApp();
  const { data: profile } = useProfile();
  const { data: cls } = useClassAnalytics({ classId: activeClassObj?.id, subjectId: activeSubject?.id });
  const names = useMemo(() => Object.fromEntries((cls?.students ?? []).map((s) => [s.id, s.name])), [cls]);
  const back = () => navigate("/teacher/analytics");

  const header = (intro) => (
    <PageHeader
      crumbs={[{ label: <Scope /> }, { label: "Analytics", to: "/teacher/analytics" }, { label: "Send reports" }]}
      title="Send reports on WhatsApp"
      intro={intro}
    />
  );
  if (!queue) {
    return (
      <div className="mx-auto max-w-[760px] px-5 py-6 tablet:px-8 tablet:py-8">
        {header("Reports go to parents one WhatsApp message at a time, opened by you.")}
        <EmptyState title="Nothing to send" body="Start from a student or the class table and choose Share report." action="Back to analytics" onAction={back} />
      </div>
    );
  }
  if (!profile) return <PageLoading />;
  const batch = { ...queue.batch, style: normalizeSummaryPrefs(profile.prefs?.parentSummary) };
  return (
    <div className="mx-auto max-w-[760px] px-5 py-6 tablet:px-8 tablet:py-8">
      {header("Open each message yourself. Vellum doesn't send anything and keeps no copy of the text or the number.")}
      <SendQueue batch={batch} request={queue.request} names={names} />
    </div>
  );
};

export default TeacherShareQueue;
