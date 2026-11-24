import { REPORT_LABELS } from "@/lib/reportLabels";
import { formatDateTime } from "@/lib/time";

// ═══════════════════════════════════════════════════════════════
// THE REPORT SHEET (F12b). One A4 portrait page that is also readable on a phone.
// It shows confirmed marks only; never integrity events, never another student's
// marks, never question text. Meaning never rests on colour alone (the chart uses
// line style and marker shape, every number is also written out).
// Language: English, Urdu (the whole sheet turns right-to-left) or both (English · اردو).
// Only the fixed wording is translated; names, topics and feedback appear as entered.
// ═══════════════════════════════════════════════════════════════
const ARROW = { up: "↑", down: "↓", steady: "→" };

/** One label in the report's language. Letter-spacing and capitals are switched off for Urdu in CSS (.report-sheet [lang="ur"]). */
const L = ({ lang, k }) => {
  const [en, ur] = REPORT_LABELS[k];
  if (lang === "ur") return <span lang="ur">{ur}</span>;
  if (lang === "both" && en !== ur) return <>{en} <span lang="ur" dir="rtl" className="text-ink-3">{ur}</span></>;
  return en;
};

/** A long sentence: in "both" mode English and Urdu go on their own lines (mixing them in one line scrambles the order). */
const LBlock = ({ lang, k }) => {
  const [en, ur] = REPORT_LABELS[k];
  if (lang === "ur") return <span lang="ur">{ur}</span>;
  if (lang === "both") return <><span className="block">{en}</span><span lang="ur" dir="rtl" className="block text-ink-3">{ur}</span></>;
  return en;
};

// A step is written in one language: right-to-left when it is mostly Arabic script (a Latin topic name inside it stays readable).
const isUrdu = (s) => (s.match(/[\u0600-\u06FF]/g)?.length ?? 0) > (s.match(/[A-Za-z]/g)?.length ?? 0);

const Heading = ({ children }) => <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3">{children}</h3>;

const Stat = ({ label, value, note }) => (
  <div className="min-w-0 rounded-md border border-rule-2 px-3 py-2.5">
    <div className="text-[11.5px] font-medium text-ink-3">{label}</div>
    <div dir="ltr" className="mt-0.5 text-start font-mono text-[22px] font-semibold tabular-nums leading-none text-ink">{value}</div>
    {note && <div className="mt-1 text-[11.5px] text-ink-3">{note}</div>}
  </div>
);

// Marks by test: "you" is a solid line with round markers, the class average a dashed line with square markers.
// Always drawn left to right, even in an Urdu sheet (time runs left to right on a chart).
const TrendChart = ({ points, title }) => {
  const W = 560;
  const H = 190;
  const L0 = 34;
  const R = 12;
  const T = 12;
  const B = 28;
  const x = (i) => (points.length === 1 ? (L0 + W - R) / 2 : L0 + (i * (W - L0 - R)) / (points.length - 1));
  const y = (v) => T + ((100 - v) * (H - T - B)) / 100;
  const line = (key) => points.map((p, i) => (p[key] == null ? null : `${x(i)},${y(p[key])}`)).filter(Boolean).join(" ");
  const summary = points.map((p, i) => `Test ${i + 1}, ${p.label}: ${p.you}%${p.class != null ? `, class ${p.class}%` : ""}`).join("; ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} dir="ltr" role="img" aria-label={`${title}. ${summary}`} className="h-auto w-full">
      {[0, 25, 50, 75, 100].map((g) => (
        <g key={g}>
          <line x1={L0} x2={W - R} y1={y(g)} y2={y(g)} stroke="var(--color-rule-2)" strokeWidth={g === 75 ? 1.2 : 0.8} strokeDasharray={g === 75 ? "2 3" : undefined} />
          <text x={L0 - 6} y={y(g) + 3.5} textAnchor="end" fontSize="10" fill="var(--color-ink-3)">{g}</text>
        </g>
      ))}
      {points.length > 1 && <polyline points={line("class")} fill="none" stroke="var(--color-ink-3)" strokeWidth="1.8" strokeDasharray="5 4" />}
      {points.length > 1 && <polyline points={line("you")} fill="none" stroke="var(--color-primary)" strokeWidth="2.4" />}
      {points.map((p, i) => (
        <g key={p.testId}>
          {p.class != null && <rect x={x(i) - 3.5} y={y(p.class) - 3.5} width="7" height="7" fill="var(--color-surface)" stroke="var(--color-ink-3)" strokeWidth="1.6" />}
          <circle cx={x(i)} cy={y(p.you)} r="4.5" fill="var(--color-primary)" />
          <text x={x(i)} y={y(p.you) - 9} textAnchor="middle" fontSize="10.5" fontWeight="600" fill="var(--color-ink)">{p.you}%</text>
          <text x={x(i)} y={H - 10} textAnchor="middle" fontSize="10" fill="var(--color-ink-3)">T{i + 1}</text>
        </g>
      ))}
    </svg>
  );
};

const TopicList = ({ title, items, empty }) => (
  <div className="min-w-0">
    <div className="mb-1 text-[12.5px] font-semibold text-ink">{title}</div>
    {items.length === 0 ? (
      <p className="text-[12.5px] text-ink-3">{empty}</p>
    ) : (
      <ul className="space-y-1">
        {items.map((t) => (
          <li key={t.name} className="flex items-baseline justify-between gap-3 text-[13px] text-ink-2">
            <span dir="auto" className="min-w-0">{t.name}</span>
            <span dir="ltr" className="shrink-0 font-mono tabular-nums text-ink">{t.accuracy}%</span>
          </li>
        ))}
      </ul>
    )}
  </div>
);

const Th = ({ children, end }) => <th className={`px-2 py-1.5 text-[11.5px] font-semibold text-ink-3 ${end ? "text-end" : "text-start"}`}>{children}</th>;
const Td = ({ children, end, mono, ...rest }) => (
  <td {...rest} className={`px-2 py-1.5 align-top text-[12.5px] text-ink-2 ${end ? "text-end" : "text-start"} ${mono ? "font-mono tabular-nums text-ink" : ""}`}>{children}</td>
);
const Num = ({ children }) => <span dir="ltr" className="inline-block">{children}</span>;

/**
 * @param report   lib/report buildReport() result
 * @param hash     reportContentHash(report) of what is on screen
 * @param issued   { id, contentHash } once saved; shown only while it still matches `hash`
 * @param teacher  the teacher's name ("Prepared by")
 */
export const ReportSheet = ({ report, hash, issued, teacher }) => {
  const { header, summary, trend, topics, tests, questions, comment, nextSteps, language: lang } = report;
  const inst = header.institution;
  const saved = issued && issued.contentHash === hash;
  const isTest = report.kind === "test";
  const dateOf = (at) => new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return (
    <article
      dir={lang === "ur" ? "rtl" : "ltr"}
      className="report-sheet mx-auto w-full max-w-[794px] rounded-lg border border-rule-2 bg-surface p-5 tablet:p-9"
      aria-label={`${isTest ? "Test" : "Progress"} report for ${header.student.name}`}
    >
      <header className="flex items-start gap-3 border-b border-rule-2 pb-4">
        {inst?.logo && <img src={inst.logo} alt="" className="size-12 shrink-0 object-contain" />}
        <div className="min-w-0 flex-1">
          <div dir="auto" className="font-serif text-[19px] font-semibold leading-tight text-ink">{inst?.name}</div>
          {inst?.city && <div dir="auto" className="text-[12px] text-ink-3">{inst.city}</div>}
        </div>
        <div className="shrink-0 text-end text-[12px] text-ink-3"><L lang={lang} k={isTest ? "titleTest" : "titleWeekly"} /></div>
      </header>

      <section className="mt-4 grid gap-x-6 gap-y-1 text-[13px] text-ink-2 narrow:grid-cols-2">
        <div><span className="text-ink-3"><L lang={lang} k="student" />: </span><span dir="auto" className="font-semibold text-ink">{header.student.name}</span></div>
        <div><span className="text-ink-3"><L lang={lang} k="class" />: </span><Num>{header.classCode}</Num>{header.student.roll ? <> · <L lang={lang} k="roll" /> <Num>{header.student.roll}</Num></> : null}</div>
        <div><span className="text-ink-3"><L lang={lang} k={isTest ? "test" : "period"} />: </span><span dir="auto">{header.period.label}</span></div>
        <div><span className="text-ink-3"><L lang={lang} k="subject" />: </span>{header.subject ?? <L lang={lang} k="allSubjects" />}</div>
      </section>

      {report.empty ? (
        <p className="mt-8 rounded-md border border-dashed border-rule-2 px-4 py-8 text-center text-[13px] text-ink-3"><LBlock lang={lang} k="noMarks" /></p>
      ) : (
        <>
          {summary && (
            <section className="mt-5 break-inside-avoid">
              <Heading><L lang={lang} k="summary" /></Heading>
              <div className="grid grid-cols-2 gap-2.5 narrow:grid-cols-4">
                <Stat label={<L lang={lang} k={isTest ? "score" : "average"} />} value={summary.average == null ? "—" : `${summary.average}%`} />
                <Stat label={<L lang={lang} k="classAverage" />} value={summary.classAverage == null ? "—" : `${summary.classAverage}%`} />
                {!isTest && <Stat label={<L lang={lang} k="tests" />} value={summary.tests} />}
                {!isTest && <Stat label={<L lang={lang} k="trend" />} value={summary.trend ? ARROW[summary.trend] : "—"} note={summary.trend ? <L lang={lang} k={summary.trend} /> : <L lang={lang} k="trendNeeds" />} />}
              </div>
            </section>
          )}

          {trend.length > 0 && (
            <section className="mt-5 break-inside-avoid">
              <Heading><L lang={lang} k="marksByTest" /></Heading>
              <TrendChart points={trend} title={REPORT_LABELS.marksByTest[0]} />
              <p className="mt-1 text-[11.5px] text-ink-3"><LBlock lang={lang} k="legend" /></p>
            </section>
          )}

          {topics && (
            <section className="mt-5 grid break-inside-avoid gap-4 narrow:grid-cols-2">
              <TopicList title={<L lang={lang} k="strongTopics" />} items={topics.strong} empty={<L lang={lang} k="noStrong" />} />
              <TopicList title={<L lang={lang} k="weakTopics" />} items={topics.weak} empty={<L lang={lang} k="noWeak" />} />
            </section>
          )}

          {tests.length > 0 && (
            <section className="mt-5 break-inside-avoid">
              <Heading><L lang={lang} k={isTest ? "result" : "tests"} /></Heading>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-rule-2">
                      <Th><L lang={lang} k="test" /></Th><Th><L lang={lang} k="date" /></Th><Th end><L lang={lang} k="score" /></Th><Th end><L lang={lang} k="percent" /></Th><Th end><L lang={lang} k="classAvg" /></Th>
                    </tr>
                  </thead>
                  <tbody>
                    {tests.map((t) => (
                      <tr key={t.testId} className="border-b border-rule last:border-b-0">
                        <Td dir="auto"><span className="text-ink">{t.title}</span>{header.subject == null && <span className="block text-[11.5px] text-ink-3">{t.subject}</span>}</Td>
                        <Td>{dateOf(t.at)}</Td>
                        <Td end mono><Num>{t.marks} / {t.max}</Num></Td>
                        <Td end mono><Num>{t.percent}%</Num></Td>
                        <Td end mono><Num>{t.classAverage == null ? "—" : `${t.classAverage}%`}</Num></Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {isTest && questions?.length > 0 && (
            <section className="mt-5">
              <Heading><L lang={lang} k="questionByQuestion" /></Heading>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-rule-2"><Th><L lang={lang} k="no" /></Th><Th><L lang={lang} k="topic" /></Th><Th end><L lang={lang} k="marks" /></Th><Th><L lang={lang} k="feedback" /></Th></tr>
                  </thead>
                  <tbody>
                    {questions.map((q) => (
                      <tr key={q.no} className="break-inside-avoid border-b border-rule last:border-b-0">
                        <Td mono>{q.no}</Td>
                        <Td dir="auto">{q.topic}</Td>
                        <Td end mono><Num>{q.marks} / {q.max}</Num></Td>
                        <Td dir="auto">{q.feedback || "—"}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      {comment && (
        <section className="mt-5 break-inside-avoid">
          <Heading><L lang={lang} k="teacherComment" /></Heading>
          <p dir="auto" className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink">{comment}</p>
          {teacher && <p className="mt-1.5 text-[12px] text-ink-3">{teacher}</p>}
        </section>
      )}

      {nextSteps.length > 0 && !report.empty && (
        <section className="mt-5 break-inside-avoid">
          <Heading><L lang={lang} k="nextSteps" /></Heading>
          <ul className="list-disc space-y-1 ps-5 text-[13px] leading-relaxed text-ink-2">
            {nextSteps.map((s) => <li key={s} dir={isUrdu(s) ? "rtl" : "ltr"} lang={isUrdu(s) ? "ur" : undefined}>{s}</li>)}
          </ul>
        </section>
      )}

      <footer className="mt-8 border-t border-rule-2 pt-3 text-[11.5px] leading-relaxed text-ink-3">
        <span dir="auto">{inst?.name}</span> · <L lang={lang} k="generated" /> <Num>{formatDateTime(header.generatedAt)}</Num> · <L lang={lang} k="confirmedOnly" /> ·{" "}
        {saved ? <><L lang={lang} k="reportWord" /> <Num>{issued.id.slice(0, 8)}</Num> · <L lang={lang} k="code" /> <Num>{hash.slice(0, 8)}</Num></> : <L lang={lang} k="preview" />}
      </footer>
    </article>
  );
};
