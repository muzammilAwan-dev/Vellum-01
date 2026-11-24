import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { generateTest } from "@/api/tests";
import { useApp } from "@/context/useApp";
import { useToast } from "@/context/useToast";
import { useBank } from "@/hooks/useBank";
import { Scope } from "@/components/common";
import { DraftRulesScreen } from "@/components/teacher-new-test/DraftRulesScreen";

const TeacherNewTest = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { activeSubject } = useApp();
  // Questions picked on the Question bank screen arrive as router state.
  const location = useLocation();
  const [bankIds, setBankIds] = useState(() => location.state?.bankIds ?? []);
  const { data: bank } = useBank(activeSubject.id);
  const picked = (bank ?? []).filter((b) => bankIds.includes(b.id));

  return (
    <DraftRulesScreen
      scope={<Scope />}
      subjectId={activeSubject.id}
      bank={{ questions: picked, onClear: () => setBankIds([]) }}
      onCancel={() => navigate("/teacher/drafts")}
      onCreate={async (config) => {
        // Throws on failure; DraftRulesScreen shows the error toast.
        const test = await generateTest({
          ...config,
          subjectId: activeSubject.id,
        });
        toast.push(
          config.mode === "personal"
            ? "Personalized tests generated — spot-check a few, then publish"
            : "Draft ready — review the questions, then publish",
          "success",
        );
        navigate(`/teacher/drafts/${test.id}`, { replace: true });
      }}
    />
  );
};

export default TeacherNewTest;
