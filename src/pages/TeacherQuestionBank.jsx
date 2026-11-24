import { useNavigate } from "react-router";
import { QuestionBank } from "@/components/teacher-question-bank/QuestionBank";
import { useApp } from "@/context/useApp";

// "Add to draft" opens the new-test flow with the picked questions riding along
// (router state — the draft is only created when the teacher generates it).
const TeacherQuestionBank = () => {
  const navigate = useNavigate();
  const { activeSubject } = useApp();
  return (
    <QuestionBank
      subjectId={activeSubject.id}
      onAddToDraft={(bankIds) => navigate("/teacher/drafts/new", { state: { bankIds } })}
    />
  );
};

export default TeacherQuestionBank;
