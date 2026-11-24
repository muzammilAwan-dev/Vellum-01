// Student & class analytics (F8). Pure functions over plain data, so the mock
// server uses them now and the real backend ports this file to
// `server/src/domain/analytics.js` unchanged.
//
// Rules (the contract; see API-CONTRACT.md "Analytics"):
//  - Only submitted attempts whose marks are ALL final count (a test still
//    waiting for the teacher's confirmation of written answers is left out
//    and reported as `awaiting`).
//  - A student only ever sees tests whose results are released to them
//    (`isReleased`), and only class AVERAGES of other students, never anyone
//    else's marks.
//  - Topic accuracy = marks earned / marks available on that topic's
//    questions, over the counted attempts.

export const pct = (earned, max) => (max > 0 ? Math.round((earned / max) * 100) : null);

/** One attempt → { earned, max, complete, byTopic: { [topic]: { earned, max } } }. */
export const scoreAttempt = (attempt) => {
  let earned = 0;
  let max = 0;
  let complete = true;
  const byTopic = {};
  (attempt.questions ?? []).forEach((q) => {
    const g = attempt.grades?.[q.id];
    max += q.marks;
    const final = g?.status === "final";
    if (!final) complete = false;
    const gain = final ? g.marks : 0;
    earned += gain;
    const topic = q.topic || "General";
    byTopic[topic] ??= { earned: 0, max: 0 };
    byTopic[topic].earned += gain;
    byTopic[topic].max += q.marks;
  });
  return { earned, max, complete, byTopic };
};

export const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/**
 * Direction of a student's results, from their per-test percents, oldest first.
 * Compares the mean of the latest two tests with the mean of all earlier ones,
 * so one odd test does not flip it. Needs TREND_MIN_TESTS results (report tools
 * such as Renaissance STAR also wait for 3 data points before drawing a trend);
 * a move of less than TREND_BAND points is "steady".
 * → "up" | "down" | "steady" | null (not enough tests)
 */
export const TREND_MIN_TESTS = 3;
export const TREND_BAND = 5;
export const trendOf = (percents) => {
  if (percents.length < TREND_MIN_TESTS) return null;
  const delta = mean(percents.slice(-2)) - mean(percents.slice(0, -2));
  return delta >= TREND_BAND ? "up" : delta <= -TREND_BAND ? "down" : "steady";
};

/**
 * @param {{ student: string, tests: object[], attempts: object[], isReleased: (test, attempt) => boolean }} input
 *   `tests` = the class's published tests; `attempts` = every attempt at those
 *   tests by the class (the student's own and classmates').
 */
export const buildStudentAnalytics = ({ student, tests, attempts, isReleased }) => {
  const byId = new Map(tests.map((t) => [t.id, t]));
  const mine = attempts
    .filter((a) => a.student === student && a.status === "submitted" && byId.has(a.testId))
    .filter((a) => isReleased(byId.get(a.testId), a));
  const scored = mine.map((a) => ({ attempt: a, test: byId.get(a.testId), score: scoreAttempt(a) }));
  const counted = scored
    .filter((s) => s.score.complete && s.score.max > 0)
    .sort((a, b) => a.attempt.submittedAt - b.attempt.submittedAt);

  const trend = counted.map((s, i) => {
    const classmates = attempts
      .filter((a) => a.testId === s.test.id && a.status === "submitted")
      .map(scoreAttempt)
      .filter((x) => x.complete && x.max > 0)
      .map((x) => pct(x.earned, x.max));
    return {
      t: `T${i + 1}`,
      testId: s.test.id,
      label: s.test.title,
      at: s.attempt.submittedAt,
      you: pct(s.score.earned, s.score.max),
      class: Math.round(mean(classmates) ?? 0),
    };
  });

  // topics: overall accuracy + a per-test series (oldest → newest) for the sparkline
  const topicMap = new Map();
  counted.forEach((s) => {
    Object.entries(s.score.byTopic).forEach(([name, v]) => {
      const row = topicMap.get(name) ?? { name, earned: 0, max: 0, series: [] };
      row.earned += v.earned;
      row.max += v.max;
      row.series.push(pct(v.earned, v.max));
      topicMap.set(name, row);
    });
  });
  const topics = [...topicMap.values()]
    .map((r) => ({ name: r.name, accuracy: pct(r.earned, r.max), trend: r.series }))
    .sort((a, b) => b.accuracy - a.accuracy);

  const first = trend[0];
  const last = trend[trend.length - 1];
  const summary = {
    tests: trend.length,
    awaiting: scored.length - counted.length,
    average: last ? Math.round(mean(trend.map((p) => p.you))) : null,
    latest: last?.you ?? null,
    classLatest: last?.class ?? null,
    changeSinceFirst: first && last && trend.length > 1 ? last.you - first.you : null,
    aheadOfClass: last ? last.you - last.class : null,
    testsAhead: trend.filter((p) => p.you > p.class).length,
    startedAhead: first ? first.you - first.class : null,
    strongest: topics[0] ?? null,
    weakest: topics.length > 1 ? topics[topics.length - 1] : null,
  };
  return { trend, topics, summary };
};

const pts = (n) => `${Math.abs(n)} ${Math.abs(n) === 1 ? "point" : "points"}`;

/** The one-line summary under the page title, from `summary`. */
export const progressSentence = (s) => {
  if (!s || s.tests === 0) return "Your progress appears here once a test has been graded and released.";
  if (s.tests === 1) return `One test so far: you scored ${s.latest}%, the class averaged ${s.classLatest}%.`;
  const start =
    s.startedAhead > 0 ? `You started ${pts(s.startedAhead)} ahead of the class.`
    : s.startedAhead < 0 ? `You started ${pts(s.startedAhead)} below the class.`
    : "You started level with the class.";
  const now =
    s.aheadOfClass > 0 ? `You're now ${pts(s.aheadOfClass)} ahead.`
    : s.aheadOfClass < 0 ? `You're now ${pts(s.aheadOfClass)} behind.`
    : "You're level with the class.";
  return `${s.tests} tests so far. ${start} ${now}`;
};

// ═══════════════ F8b — class & per-student views for teachers ═══════════════
/** A topic or student below this % is "below target" / "at risk". */
export const TARGET_PERCENT = 75;

const stddev = (xs) => {
  if (!xs.length) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
};

/**
 * Class view for one class + subject.
 * @param {{ tests: object[], attempts: object[], students: {id,name,roll}[], target?: number }} input
 *   `tests` = the subject's published tests for the class; `attempts` = every
 *   attempt at them. Unlike the student view nothing is filtered by release:
 *   the teacher sees everything that is fully graded.
 * → { trend: [{ t, testId, label, at, class, spread, students }],
 *     topics: [{ name, accuracy, affected, trend[] }],
 *     students: [{ id, name, roll, tests, overall, weak, weakAccuracy, strong, strongAccuracy,
 *                  lastTest: { testId, title, at, percent }|null, trend: "up"|"down"|"steady"|null,
 *                  belowTarget (topics under target), flags }],
 *     summary: { tests, awaiting, classAverage, changeSinceFirst, spread, belowTarget[],
 *                topicsTotal, studentsAtRisk, studentsTotal, target } }
 */
export const buildClassAnalytics = ({ tests, attempts, students, target = TARGET_PERCENT }) => {
  const byId = new Map(tests.map((t) => [t.id, t]));
  const rows = attempts
    .filter((a) => a.status === "submitted" && byId.has(a.testId))
    .map((a) => ({ attempt: a, score: scoreAttempt(a) }));
  const counted = rows.filter((r) => r.score.complete && r.score.max > 0);

  // per test, oldest first (a test's date = its latest counted submission)
  const perTest = new Map();
  counted.forEach((r) => {
    const row = perTest.get(r.attempt.testId) ?? { test: byId.get(r.attempt.testId), items: [], at: 0 };
    row.items.push(r);
    row.at = Math.max(row.at, r.attempt.submittedAt);
    perTest.set(r.attempt.testId, row);
  });
  const ordered = [...perTest.values()].sort((a, b) => a.at - b.at);

  const trend = ordered.map((o, i) => {
    const percents = o.items.map((r) => pct(r.score.earned, r.score.max));
    return {
      t: `T${i + 1}`,
      testId: o.test.id,
      label: o.test.title,
      at: o.at,
      class: Math.round(mean(percents)),
      spread: Math.round(stddev(percents)),
      students: o.items.length,
    };
  });

  // topics: class accuracy overall + per test, and how many students are below target on it
  const topicMap = new Map();
  ordered.forEach((o) => {
    const perTopic = {};
    o.items.forEach((r) =>
      Object.entries(r.score.byTopic).forEach(([name, v]) => {
        perTopic[name] ??= { earned: 0, max: 0 };
        perTopic[name].earned += v.earned;
        perTopic[name].max += v.max;
      }),
    );
    Object.entries(perTopic).forEach(([name, v]) => {
      const row = topicMap.get(name) ?? { name, earned: 0, max: 0, series: [] };
      row.earned += v.earned;
      row.max += v.max;
      row.series.push(pct(v.earned, v.max));
      topicMap.set(name, row);
    });
  });

  // each student's own accuracy per topic, across their counted attempts
  const perStudent = new Map();
  counted.forEach((r) => {
    const row = perStudent.get(r.attempt.student) ?? { percents: [], series: [], topics: {} };
    row.percents.push(pct(r.score.earned, r.score.max));
    row.series.push({ testId: r.attempt.testId, title: byId.get(r.attempt.testId).title, at: r.attempt.submittedAt, percent: pct(r.score.earned, r.score.max) });
    Object.entries(r.score.byTopic).forEach(([name, v]) => {
      row.topics[name] ??= { earned: 0, max: 0 };
      row.topics[name].earned += v.earned;
      row.topics[name].max += v.max;
    });
    perStudent.set(r.attempt.student, row);
  });
  const topicAcc = (row) =>
    Object.entries(row.topics)
      .filter(([, v]) => v.max > 0)
      .map(([name, v]) => ({ name, accuracy: pct(v.earned, v.max) }))
      .sort((a, b) => a.accuracy - b.accuracy);

  const topics = [...topicMap.values()]
    .map((r) => ({
      name: r.name,
      accuracy: pct(r.earned, r.max),
      affected: [...perStudent.values()].filter((s) => {
        const v = s.topics[r.name];
        return v && v.max > 0 && pct(v.earned, v.max) < target;
      }).length,
      trend: r.series,
    }))
    .sort((a, b) => b.accuracy - a.accuracy);

  const studentRows = students
    .map((s) => {
      const own = perStudent.get(s.name);
      const acc = own ? topicAcc(own) : [];
      const series = own ? [...own.series].sort((a, b) => a.at - b.at) : [];
      return {
        id: s.id,
        name: s.name,
        roll: s.roll,
        tests: own?.percents.length ?? 0,
        overall: own ? Math.round(mean(own.percents)) : null,
        weak: acc.length > 1 ? acc[0].name : null,
        weakAccuracy: acc.length > 1 ? acc[0].accuracy : null,
        strong: acc.length > 1 ? acc[acc.length - 1].name : null,
        strongAccuracy: acc.length > 1 ? acc[acc.length - 1].accuracy : null,
        lastTest: series.length ? series[series.length - 1] : null,
        trend: trendOf(series.map((x) => x.percent)),
        belowTarget: acc.filter((t) => t.accuracy < target).length,
        flags: attempts
          .filter((a) => a.student === s.name && byId.has(a.testId))
          .reduce((n, a) => n + (a.flags?.length ?? 0), 0),
      };
    })
    .sort((a, b) => (b.overall ?? -1) - (a.overall ?? -1) || a.name.localeCompare(b.name));

  const first = trend[0];
  const last = trend[trend.length - 1];
  const belowTarget = topics.filter((t) => t.accuracy < target).map((t) => t.name);
  return {
    trend,
    topics,
    students: studentRows,
    summary: {
      tests: trend.length,
      awaiting: rows.length - counted.length,
      classAverage: last?.class ?? null,
      changeSinceFirst: first && last && trend.length > 1 ? last.class - first.class : null,
      spread: last?.spread ?? null,
      belowTarget: belowTarget.reverse(), // weakest first
      topicsTotal: topics.length,
      studentsAtRisk: studentRows.filter((s) => s.overall != null && s.overall < target).length,
      studentsTotal: students.length,
      target,
    },
  };
};

/** One student as the teacher sees them: the student view (nothing filtered by release) + their attempts. */
export const buildStudentDetail = ({ student, tests, attempts }) => {
  const byId = new Map(tests.map((t) => [t.id, t]));
  const own = buildStudentAnalytics({ student, tests, attempts, isReleased: () => true });
  const recent = attempts
    .filter((a) => a.student === student && a.status === "submitted" && byId.has(a.testId))
    .map((a) => {
      const s = scoreAttempt(a);
      return {
        id: a.id,
        testId: a.testId,
        test: byId.get(a.testId).title,
        at: a.submittedAt,
        earned: s.earned,
        max: s.max,
        percent: s.complete ? pct(s.earned, s.max) : null,
        flags: a.flags?.length ?? 0,
      };
    })
    .sort((a, b) => b.at - a.at);
  return { ...own, recent };
};

/** Short, data-driven findings for the "What matters" panels (weakest topics first). */
export const topicInsights = (topics, { students, target = TARGET_PERCENT } = {}) => {
  const sorted = [...topics].sort((a, b) => a.accuracy - b.accuracy);
  const below = sorted.filter((t) => t.accuracy < target);
  const out = below.slice(0, 2).map((t, i) => {
    const change = t.trend.length > 1 ? t.trend[t.trend.length - 1] - t.trend[0] : null;
    const bits = [];
    if (students) bits.push(`${t.affected} of ${students} students are below ${target}%`);
    if (change) bits.push(`${change > 0 ? "up" : "down"} ${Math.abs(change)} ${Math.abs(change) === 1 ? "point" : "points"} since T1`);
    return { kind: i === 0 ? "weakest" : "weak", name: t.name, accuracy: t.accuracy, tone: t.accuracy < target - 15 ? "danger" : "warning", detail: bits.join("; ") };
  });
  const rest = sorted.slice(out.length);
  if (rest.length) {
    const min = rest[0].accuracy;
    out.push({
      kind: "rest",
      name: out.length ? "Everything else" : "Every topic",
      accuracy: min,
      tone: "success",
      detail: out.length ? "Safe to reduce weight in the next draft" : "Nothing is below target",
    });
  }
  return out;
};

/** The sentence under the teacher dashboard title. */
export const classSentence = (s) => {
  if (!s || s.tests === 0) return "No graded tests yet. Once students submit and marks are final, the class picture appears here.";
  const trend =
    s.changeSinceFirst == null ? `${s.tests === 1 ? "One test" : `${s.tests} tests`} so far.`
    : s.changeSinceFirst > 0 ? `${s.tests} tests this term. The class is improving`
    : s.changeSinceFirst < 0 ? `${s.tests} tests this term. The class average has slipped`
    : `${s.tests} tests this term. The class average is flat`;
  const n = s.belowTarget.length;
  if (s.changeSinceFirst == null) return `${trend} ${n ? `${n} ${n === 1 ? "topic is" : "topics are"} below target.` : "Every topic is on target."}`;
  return n ? `${trend}, but ${n} ${n === 1 ? "topic is" : "topics are"} holding it back.` : `${trend}, and every topic is on target.`;
};

/**
 * Weak topic per student, for personalized test variants (F8c).
 *  - A student with graded history gets their own lowest topic, but only if it
 *    is actually below target (otherwise null: nothing to lean on).
 *  - A student with no graded history yet inherits the class's weakest topic
 *    when that is below target (`source: "class"`), so a new student's variant
 *    still targets what the class needs.
 * Same inputs as `buildClassAnalytics`.
 * → { [studentName]: { topic, accuracy, source: "student" | "class" } | null }
 */
export const weakTopicMap = ({ tests, attempts, students, target = TARGET_PERCENT }) => {
  const a = buildClassAnalytics({ tests, attempts, students, target });
  const classWeak = a.topics.length ? a.topics[a.topics.length - 1] : null;
  const out = {};
  a.students.forEach((s) => {
    if (s.overall != null) {
      out[s.name] = s.weak && s.weakAccuracy < target ? { topic: s.weak, accuracy: s.weakAccuracy, source: "student" } : null;
    } else {
      out[s.name] = classWeak && classWeak.accuracy < target ? { topic: classWeak.name, accuracy: classWeak.accuracy, source: "class" } : null;
    }
  });
  return out;
};
