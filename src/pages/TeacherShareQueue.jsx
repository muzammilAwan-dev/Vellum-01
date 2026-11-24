import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft } from "lucide-react";
import { EmptyState, PageLoading } from "@/components/common";
import { Button } from "@/components/ui/button";
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

  if (!queue) {
    return <div className="mx-auto max-w-[760px] px-4 py-10"><EmptyState title="Nothing to send" body="Start from a student or the class table and choose Share report." action="Back to analytics" onAction={back} /></div>;
  }
  if (!profile) return <PageLoading />;
  const batch = { ...queue.batch, style: normalizeSummaryPrefs(profile.prefs?.parentSummary) };
  return (
    <div className="mx-auto max-w-[760px] px-4 py-6 tablet:px-8 tablet:py-8">
      <Button variant="ghost" size="sm" onClick={back} className="mb-4"><ArrowLeft size={14} />Back to analytics</Button>
      <h1 className="mb-1 font-serif text-[26px] font-semibold leading-tight tracking-[-0.02em] text-ink">Send on WhatsApp</h1>
      <p className="mb-5 text-[13.5px] text-ink-2">Open each message yourself. Vellum doesn't send anything.</p>
      <SendQueue batch={batch} request={queue.request} names={names} />
    </div>
  );
};

export default TeacherShareQueue;
