// Per-test options chosen in the publish dialog (guide §6 "Test": anti-cheat
// settings, result-release policy). The server stores and enforces them (and
// sends them complete); these are the dialog's starting values and a safety net
// for screens reading a test that has none.
export const DEFAULT_SETTINGS = {
  release: "after_close", // "immediately" | "after_close"  (§7.10)
  aiGrading: true, // false → every written answer goes to the manual queue (§7.9)
  allowBack: true, // false → one question at a time, no going back (§7.8)
  requireFullscreen: true, // ask for fullscreen on Begin; leaving it is flagged
  blockCopyPaste: true, // no right-click / copy / cut / paste on the test page (attempts are flagged)
  shuffleQuestions: false, // each student sees the questions in their own order (decided per attempt by the server)
  shuffleOptions: false, // ...and the options of multiple-choice questions in their own order
};

export const RELEASE_LABELS = {
  immediately: "Right after each student submits",
  after_close: "Once the test has closed",
};

export const getSettings = (test) => ({ ...DEFAULT_SETTINGS, ...(test?.settings ?? {}) });

/**
 * What the student is told before they begin (shown on the intro screen), so
 * nothing recorded is a surprise. All but the last depend on the teacher's
 * choices; the last is always true.
 */
export const integrityRules = (test) => {
  const { requireFullscreen, blockCopyPaste, shuffleQuestions, shuffleOptions } = getSettings(test);
  return [
    requireFullscreen && "The test runs in fullscreen. Leaving fullscreen is recorded.",
    blockCopyPaste && "Copying, pasting and the right-click menu are turned off.",
    (shuffleQuestions || shuffleOptions) &&
      `${shuffleQuestions && shuffleOptions ? "Questions and answer options appear" : shuffleQuestions ? "Questions appear" : "Answer options appear"} in a different order for each student.`,
    "Switching tabs or windows, clicking outside the test, or pressing developer-tool shortcuts is recorded and shown to your teacher with the time it happened.",
  ].filter(Boolean);
};
