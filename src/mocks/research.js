// ═══════════════════════════════════════════════════════════════
// FAKE TOPIC COVERAGE + WEB RESEARCH
// The real server measures how much of the teacher's own material covers each
// topic ("thin" = too little to write good questions from) and, when asked,
// fetches current web pages for the thin ones. Web results are always labelled
// `kind: "web"` and kept apart from the teacher's own passages
// (`kind: "material"`). The URLs below are placeholders (example.org).
// Delete with src/mocks.
// ═══════════════════════════════════════════════════════════════
import { EXTRACTED_TOPICS } from "@/data/materials";

const MATERIAL_NOTES = {
  "Newton's Laws of Motion": "Unit 1 · Newton's three laws of motion, free body diagrams, application of F = ma.",
  Thermodynamics: "Unit 3 · Temperature and heat. First law of thermodynamics.",
  Kinematics: "Unit 1 · Displacement, velocity and acceleration; equations of uniformly accelerated motion.",
  "Wave Optics": "One line in the outline: \"Waves and light (brief)\".",
  Electromagnetism: "Unit 4 · Electric fields, magnetic force on a moving charge.",
  Gravitation: "Unit 5 · Newton's law of gravitation, orbital motion.",
};
const WEB_NOTES = {
  "Wave Optics": {
    title: "Interference and diffraction of light — worked examples",
    url: "https://example.org/physics/wave-optics",
    snippet: "Young's double-slit experiment: bright fringes occur where the path difference is a whole number of wavelengths. Fringe spacing = λD / d.",
  },
};
const genericWeb = (topic) => ({
  title: `${topic} — overview and worked examples`,
  url: `https://example.org/physics/${encodeURIComponent(topic.toLowerCase().replace(/[^a-z]+/g, "-"))}`,
  snippet: `A short current explanation of ${topic}, with two worked examples.`,
});

/** A subject's topics. No uploaded material → nothing to measure → []. */
export const subjectTopics = (materials) =>
  materials.length
    ? EXTRACTED_TOPICS.map((t) => ({ name: t.name, weight: t.weight, thin: t.thin, passages: t.weight }))
    : [];

/**
 * Tags each question with where it came from. Everything gets the teacher's
 * own passage; with `webResearch` on, questions on thin topics also get a
 * labelled web source. Returns { enabled, thinTopics, webQuestions }.
 */
export const attachSources = (questionLists, topics, { webResearch, now }) => {
  const thin = new Set(topics.filter((t) => t.thin).map((t) => t.name));
  const covered = new Set();
  let webQuestions = 0;
  questionLists.forEach((qs) =>
    qs.forEach((q) => {
      if (q.bankId) return; // reused from the bank: keeps its own source
      const sources = [];
      if (MATERIAL_NOTES[q.topic] && topics.some((t) => t.name === q.topic))
        sources.push({ kind: "material", label: `Your outline — ${q.topic}`, snippet: MATERIAL_NOTES[q.topic] });
      if (thin.has(q.topic)) {
        covered.add(q.topic);
        if (webResearch) {
          const w = WEB_NOTES[q.topic] ?? genericWeb(q.topic);
          sources.push({ kind: "web", label: w.title, url: w.url, snippet: w.snippet, retrievedAt: now });
          webQuestions++;
        }
      }
      q.sources = sources;
    }),
  );
  return { enabled: !!webResearch, thinTopics: [...covered], webQuestions };
};
