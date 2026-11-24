import { useLocation, useNavigate, useParams } from "react-router";
import { StudentProfile } from "@/components/teacher-analytics/StudentProfile";

// /teacher/analytics/:studentId — the id is the student's account id. `location.state.order`
// (the students in the list the teacher came from) is carried on to the report page.
const TeacherStudentProfile = () => {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <StudentProfile
      studentId={studentId}
      onBack={() => navigate("/teacher/analytics")}
      onReport={() => navigate(`/teacher/analytics/${encodeURIComponent(studentId)}/report`, { state: location.state })}
    />
  );
};

export default TeacherStudentProfile;
