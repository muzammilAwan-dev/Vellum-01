// Fixed wording of the report sheet in English and Urdu (F12b follow-up).
// Names, topics, test titles and feedback are shown exactly as they were entered: nothing is
// translated by machine. The Urdu below is standard school-report wording kept free of
// gendered verbs, but it MUST be checked by an Urdu-speaking teacher before use (plan decision 14).
export const REPORT_LANGUAGES = [
  { id: "en", label: "English" },
  { id: "ur", label: "اردو (Urdu)" },
  { id: "both", label: "English + اردو" },
];

export const REPORT_LABELS = {
  titleWeekly: ["Progress report", "پیش رفت کی رپورٹ"],
  titleTest: ["Test report", "ٹیسٹ رپورٹ"],
  student: ["Student", "طالب علم"],
  class: ["Class", "جماعت"],
  roll: ["Roll", "رول نمبر"],
  period: ["Period", "مدت"],
  test: ["Test", "ٹیسٹ"],
  subject: ["Subject", "مضمون"],
  allSubjects: ["All subjects", "تمام مضامین"],
  summary: ["Summary", "خلاصہ"],
  score: ["Score", "حاصل کردہ نمبر"],
  average: ["Average", "اوسط"],
  classAverage: ["Class average", "جماعت کی اوسط"],
  tests: ["Tests", "ٹیسٹ"],
  trend: ["Trend", "رجحان"],
  trendNeeds: ["Needs 3 tests", "کم از کم 3 ٹیسٹ درکار"],
  up: ["Improving", "بہتری"],
  down: ["Slipping", "کمی"],
  steady: ["Steady", "مستحکم"],
  noMarks: ["No confirmed marks in this period yet.", "اس مدت میں ابھی کوئی تصدیق شدہ نمبر نہیں ہیں۔"],
  marksByTest: ["Marks by test", "ٹیسٹ کے لحاظ سے نمبر"],
  legend: [
    "Solid line with round dots: this student. Dashed line with square dots: class average. Dotted line: 75% target.",
    "ٹھوس لکیر اور گول نقطے: طالب علم۔ ٹوٹی لکیر اور چوکور نقطے: جماعت کی اوسط۔ نقطہ دار لکیر: 75% ہدف۔",
  ],
  strongTopics: ["Strong topics (75% or more)", "مضبوط موضوعات (75% یا زیادہ)"],
  weakTopics: ["Needs more work (under 75%)", "مزید محنت درکار (75% سے کم)"],
  noStrong: ["No topic at 75% yet.", "ابھی کوئی موضوع 75% پر نہیں۔"],
  noWeak: ["Every topic is at 75% or more.", "تمام موضوعات 75% یا اس سے زیادہ ہیں۔"],
  result: ["Result", "نتیجہ"],
  date: ["Date", "تاریخ"],
  percent: ["%", "%"],
  classAvg: ["Class avg", "جماعت کی اوسط"],
  questionByQuestion: ["Question by question", "سوال بہ سوال"],
  no: ["No.", "نمبر شمار"],
  topic: ["Topic", "موضوع"],
  marks: ["Marks", "نمبر"],
  feedback: ["Teacher's feedback", "استاد کی رائے"],
  teacherComment: ["Teacher's comment", "استاد کا تبصرہ"],
  nextSteps: ["Next steps", "آئندہ اقدامات"],
  generated: ["generated", "تیار کردہ"],
  confirmedOnly: ["confirmed marks only", "صرف تصدیق شدہ نمبر"],
  reportWord: ["report", "رپورٹ"],
  code: ["code", "کوڈ"],
  preview: ["preview, not saved yet", "پیش نظارہ، ابھی محفوظ نہیں"],
};

/** The words for one language: "en" and "ur" give one string; "both" gives "English · اردو". */
export const label = (lang, key) => {
  const [en, ur] = REPORT_LABELS[key];
  return lang === "ur" ? ur : lang === "both" && en !== ur ? `${en} · ${ur}` : en;
};

/** Next-step sentences per language (the weak topic's name is inserted as typed). */
export const STEP_TEXT = {
  en: {
    low: (n) => `${n}: go through the class notes again and redo the worked examples; ask the teacher for extra practice.`,
    mid: (n) => `${n}: practise 3 or 4 more questions a day before the next test.`,
    none: "Keep up the current routine. A short revision before each test is enough.",
  },
  ur: {
    low: (n) => `${n}: کلاس کے نوٹس دوبارہ پڑھیں اور حل شدہ مثالیں دوبارہ حل کریں؛ استاد سے اضافی مشق مانگیں۔`,
    mid: (n) => `${n}: اگلے ٹیسٹ سے پہلے روزانہ 3 یا 4 مزید سوالات حل کریں۔`,
    none: "موجودہ معمول جاری رکھیں۔ ہر ٹیسٹ سے پہلے مختصر دہرائی کافی ہے۔",
  },
};

/** Ready-made comment sentences, so a teacher without an Urdu keyboard can still write in Urdu. */
export const COMMENT_PHRASES = [
  { id: "excellent", en: "Excellent work this period. Keep it up.", ur: "اس مدت میں شاندار کام۔ اسی طرح جاری رکھیں۔" },
  { id: "good", en: "Good progress. A little more practice will help.", ur: "اچھی پیش رفت ہے۔ تھوڑی مزید مشق سے مزید بہتری آئے گی۔" },
  { id: "improved", en: "Results have improved compared with the earlier tests.", ur: "پچھلے ٹیسٹوں کے مقابلے میں نتائج بہتر ہوئے ہیں۔" },
  { id: "dropped", en: "Results have dropped; let us work together to fix this.", ur: "نتائج میں کمی آئی ہے؛ آئیے مل کر اسے بہتر بنائیں۔" },
  { id: "revise", en: "Please revise the weak topics before the next test.", ur: "براہِ کرم اگلے ٹیسٹ سے پہلے کمزور موضوعات کی دہرائی کریں۔" },
  { id: "homework", en: "Please make sure homework is completed on time.", ur: "براہِ کرم ہوم ورک بروقت مکمل کروائیں۔" },
  { id: "participation", en: "Class participation is good.", ur: "کلاس میں شرکت اچھی ہے۔" },
  { id: "meet", en: "Please meet the teacher to discuss progress.", ur: "پیش رفت پر بات کے لیے براہِ کرم استاد سے ملاقات کریں۔" },
];

/** Add a phrase to the end of a comment (a space or a new line between); unchanged if it would not fit. */
export const addPhrase = (comment, phrase, lang, max) => {
  const text = phrase[lang];
  const base = String(comment ?? "").trimEnd();
  const next = base ? `${base}${lang === "ur" && /[a-z]/i.test(base.slice(-1)) ? "\n" : " "}${text}` : text;
  return next.length > max ? comment : next;
};
