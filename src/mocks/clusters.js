// ═══════════════════════════════════════════════════════════════
// FAKE QUESTION SPLITTING + CLUSTERING
// The real server splits a past paper into questions and groups them by
// embedding similarity. This stand-in uses a tiny physics "concept" lexicon
// plus word overlap, so the same questions reworded across papers land in the
// same cluster and the demo behaves believably. Delete with src/mocks.
// ═══════════════════════════════════════════════════════════════
const STOP = new Set(
  "the a an of in on at to is are was were and or for with from by as it its this that which what find state explain use draw into then than when each how does do be can will".split(" "),
);

const CONCEPTS = {
  newton2: { label: "Acceleration from Newton's Second Law", words: ["acceleration", "accelerate", "applied", "frictionless", "smooth", "pushed", "pulled"] },
  incline: { label: "Free body diagrams for inclined planes", words: ["incline", "ramp", "slope", "slides", "inclined"] },
  thermo: { label: "Isothermal vs adiabatic processes", words: ["isothermal", "adiabatic", "ideal", "gas"] },
  braking: { label: "Braking force and deceleration", words: ["decelerates", "brakes", "braking", "brake"] },
  inertia: { label: "Inertia and Newton's laws", words: ["inertia", "newton's", "law"] },
  optics: { label: "Refraction and interference", words: ["snell", "refraction", "refracts", "interference", "coherent", "glass"] },
  projectile: { label: "Projectile motion", words: ["projectile", "launched", "thrown", "flight"] },
};

const tokens = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z' ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));

const vectorOf = (text) => {
  const vec = new Map();
  const toks = tokens(text);
  toks.forEach((t) => vec.set(t, (vec.get(t) ?? 0) + 1));
  let best = null;
  Object.entries(CONCEPTS).forEach(([id, c]) => {
    const hits = toks.filter((t) => c.words.includes(t)).length;
    if (hits) {
      vec.set(`#${id}`, Math.min(3, hits * 1.5));
      if (!best || hits > best.hits) best = { id, hits };
    }
  });
  return { vec, concept: best?.id ?? null };
};

const cosine = (a, b) => {
  let dot = 0;
  let na = 0;
  let nb = 0;
  a.forEach((v, k) => {
    na += v * v;
    if (b.has(k)) dot += v * b.get(k);
  });
  b.forEach((v) => (nb += v * v));
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
};

/** "1. Question…" lines (with wrapped continuation lines) → ["Question…", …]. */
export const splitQuestions = (text) => {
  const out = [];
  let current = null;
  String(text)
    .split("\n")
    .forEach((line) => {
      const start = /^\s*\d+[.)]\s+(.+)$/.exec(line);
      if (start) {
        current = start[1].trim();
        out.push(current);
      } else if (current && line.trim() && !/^(section|\[)/i.test(line.trim())) {
        out[out.length - 1] = `${out[out.length - 1]} ${line.trim()}`;
      } else {
        current = null;
      }
    });
  return out;
};

/**
 * papers: [{ id, name, year, questions: [{ id, text }] }]
 * → clusters, largest first. A cluster joins a question to its seed when their
 * similarity reaches `threshold` (higher = stricter, more and smaller clusters).
 */
export const clusterQuestions = (papers, threshold) => {
  const clusters = [];
  papers.forEach((paper) =>
    paper.questions.forEach((q) => {
      const { vec, concept } = vectorOf(q.text);
      const item = { id: q.id, text: q.text, paperId: paper.id, paperName: paper.name, ...(paper.year ? { year: paper.year } : {}) };
      let best = null;
      clusters.forEach((c) => {
        const s = cosine(vec, c.seedVec);
        if (s >= threshold && (!best || s > best.s)) best = { c, s };
      });
      if (best) best.c.questions.push(item);
      else clusters.push({ seedVec: vec, concept, seedText: q.text, questions: [item] });
    }),
  );
  return clusters
    .map((c, i) => {
      const paperIds = new Set(c.questions.map((q) => q.paperId));
      const years = [...new Set(c.questions.map((q) => q.year).filter(Boolean))].sort();
      return {
        id: `cl-${i + 1}`,
        label: c.concept ? CONCEPTS[c.concept].label : `${c.seedText.split(" ").slice(0, 7).join(" ")}…`,
        count: c.questions.length,
        paperCount: paperIds.size,
        years,
        sample: c.seedText,
        questions: c.questions,
      };
    })
    .sort((a, b) => b.paperCount - a.paperCount || b.count - a.count)
    .map((c, i) => ({ ...c, id: `cl-${i + 1}` }));
};

// Distinct phrasings per topic; each fake paper picks some of them (by year)
// so clusters have a believable spread.
const POOL = [
  ["A 5 kg block rests on a frictionless surface. A horizontal force of 20 N is applied. What is the acceleration?", "A 8 kg crate is pushed with a 24 N force on a smooth floor. Find its acceleration.", "A 2 kg cart is pulled by a 10 N force along a frictionless track. What is its acceleration?"],
  ["Draw the forces on a 3 kg mass on a 30° incline and find the component along the slope.", "A 4 kg box slides down a 25° ramp. Draw a free body diagram and find the net force down the slope."],
  ["In an isothermal expansion, which quantity remains constant?", "Compare isothermal and adiabatic processes for an ideal gas.", "State what stays constant in an isothermal process and explain why."],
  ["A car of mass 1200 kg decelerates from 25 m/s to rest in 8 s. Find the average braking force.", "A 900 kg car brakes from 20 m/s to rest in 5 s. What average force acts on it?"],
  ["State Newton's Second Law and explain its relation to inertia.", "Explain how inertia relates to Newton's First Law."],
  ["Light passes from air into glass. Use Snell's law to find the angle of refraction.", "Explain interference of two coherent waves and state the condition for constructive interference."],
  ["A projectile is launched at 20 m/s at 40°. Find its time of flight.", "A ball is thrown at 15 m/s at 30° above the horizontal. Find its maximum height."],
];
// How many of every 5 consecutive papers include each topic (newton2 in all,
// optics in one …) — so some clusters recur a lot and others barely.
const KEEP = [5, 4, 3, 3, 2, 1, 2];
export const fakePaperQuestions = (seed) => {
  const picked = [];
  POOL.forEach((variants, i) => {
    if ((seed + i) % 5 < KEEP[i]) picked.push(variants[(seed + i) % variants.length]);
  });
  return picked.map((q, i) => `${i + 1}. ${q}`).join("\n");
};
