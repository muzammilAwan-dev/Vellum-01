import { useNavigate } from "react-router";
import { TeacherLMS } from "@/components/teacher-courses/TeacherLMS";

const TeacherCourses = () => {
  const navigate = useNavigate();
  return <TeacherLMS onOpenDiscussion={() => navigate("/teacher/chat")} />;
};

export default TeacherCourses;
