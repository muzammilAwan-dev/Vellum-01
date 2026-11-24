import { useNavigate } from "react-router";
import { AnalyticsOverview } from "@/components/teacher-analytics/AnalyticsOverview";

// ─── Teacher analytics (/teacher/analytics). A student opens at
// /teacher/analytics/:studentId (TeacherStudentProfile), so it can be linked to.
const TeacherAnalytics = () => {
  const navigate = useNavigate();
  return (
    <AnalyticsOverview
      onStudentClick={(s, order) => navigate(`/teacher/analytics/${encodeURIComponent(s.id)}`, { state: { order } })}
    />
  );
};

export default TeacherAnalytics;
