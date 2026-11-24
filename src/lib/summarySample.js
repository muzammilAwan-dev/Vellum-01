import { COMMENT_PHRASES } from "./reportLabels";
import { buildReport, DEFAULT_REPORT_OPTIONS, resolvePeriod } from "./report";

// A made-up student for previewing a teacher's parent-message style (F12c2). Fixed date, so the preview never jumps.
const NOW = new Date(2026, 10, 18, 9, 0).getTime();
const DAY = 86_400_000;
const row = (i, test, percent, classAverage, ago) => ({ testId: `sample-${i}`, test, subject: "Physics", at: NOW - ago * DAY, marks: percent * 0.3, max: 30, percent, classAverage });

/** A weekly report for "Sample Student", every section on, with the comment in the language asked for. */
export const sampleReport = (language = "en") => {
  const comment = COMMENT_PHRASES.find((p) => p.id === "good")[language === "ur" ? "ur" : "en"];
  return buildReport({
    student: { id: "sample", name: "Sample Student", cls: "10A", roll: "10A-01" },
    preset: "weekly",
    period: resolvePeriod("last7", {}, NOW),
    subjectName: "Physics",
    rows: [row(1, "Kinematics Quiz", 70, 68, 6), row(2, "Forces Test", 78, 71, 4), row(3, "Energy Quiz", 85, 73, 1)],
    topics: [
      { name: "Kinematics", accuracy: 92 },
      { name: "Energy", accuracy: 80 },
      { name: "Wave Optics", accuracy: 48 },
      { name: "Thermodynamics", accuracy: 62 },
    ],
    options: { ...DEFAULT_REPORT_OPTIONS, language, comment },
    now: NOW,
  });
};
export const SAMPLE_CONTEXT = { parentName: "Mr. Tariq", teacherName: "Your name" };
