import { useNavigate } from "react-router";
import { StudentLMS } from "@/components/student-courses/StudentLMS";

const StudentCourses = () => {
  const navigate = useNavigate();
  return <StudentLMS onOpenDiscussion={() => navigate("/student/chat")} />;
};

export default StudentCourses;
