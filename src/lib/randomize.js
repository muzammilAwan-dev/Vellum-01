// Per-attempt randomization (guide §6: shuffle questions / options).
//
// Pure and deterministic: the same seed always gives the same order, so the
// server can derive or re-check an attempt's order from its id. The mock server
// calls this once when an attempt starts and stores the result on the attempt;
// the real backend ports this file to `server/src/domain/randomize.js`.
//
// Rules
//  - Question order: every question moves.
//  - Options: only multiple-choice questions move. True/false keeps True, False.
//    Options like "All of the above" / "None of the above" stay last (in their
//    original order) because they only make sense there.
//  - `correctIndex` is remapped to the shuffled options, so grading and review
//    work on the attempt's own snapshot with no extra mapping.
//  - `order` records where everything came from (original ids / indices) so
//    teacher results and analytics can map an answer back to the bank question.

const hash = (str) => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

/** mulberry32 — tiny seeded PRNG returning floats in [0, 1). */
export const seededRandom = (seed) => {
  let a = hash(String(seed));
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Fisher–Yates on a copy. */
export const shuffled = (items, rand) => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

const PINNED_OPTION = /^\s*(all|none|both)\s+of\s+the\s+(above|these)\b/i;

/** Indices (into the original options) in the order a student sees them. */
const optionOrderFor = (q, rand) => {
  const idx = q.options.map((_, i) => i);
  if (q.type !== "mcq") return idx; // true/false and non-choice keep their order
  const pinned = idx.filter((i) => PINNED_OPTION.test(String(q.options[i])));
  const free = idx.filter((i) => !pinned.includes(i));
  return [...shuffled(free, rand), ...pinned];
};

/**
 * @param {object[]} questions  full questions (with keys), original order
 * @param {{ shuffleQuestions?: boolean, shuffleOptions?: boolean, seed: string }} opts
 * @returns {{ questions: object[], order: { questions: string[], options: Record<string, number[]> } }}
 *   `order.questions` = original ids in the order shown;
 *   `order.options[qid][shownIndex]` = original option index.
 */
export const randomizeQuestions = (questions, { shuffleQuestions = false, shuffleOptions = false, seed }) => {
  const rand = seededRandom(seed);
  const base = questions.map((q) => ({ ...q }));
  const ordered = shuffleQuestions ? shuffled(base, rand) : base;
  const options = {};
  const out = ordered.map((q) => {
    if (!shuffleOptions || !Array.isArray(q.options)) return q;
    const order = optionOrderFor(q, rand);
    options[q.id] = order;
    return {
      ...q,
      options: order.map((i) => q.options[i]),
      correctIndex: Number.isInteger(q.correctIndex) ? order.indexOf(q.correctIndex) : q.correctIndex,
    };
  });
  return { questions: out, order: { questions: out.map((q) => q.id), options } };
};
