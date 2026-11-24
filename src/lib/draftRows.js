// Pure rules for the Tests list (no UI imports): which action is the main one
// for a row, what goes in the "more" menu, and the one-line status note.
export const STATUSES = ["draft", "scheduled", "live", "completed"];

export const STATUS_LABEL = {
  draft: "Draft",
  scheduled: "Scheduled",
  live: "Live now",
  completed: "Completed",
};

// Adjective used in empty-state copy: "No live tests".
export const STATUS_NOUN = { draft: "draft", scheduled: "scheduled", live: "live", completed: "completed" };

const OPEN = { id: "open", label: "Open" };
const DELETE = { id: "delete", label: "Delete", danger: true, separatorBefore: true };

/** One visible primary action plus a menu for the rest. Live tests cannot be deleted. */
export const rowPlan = (test) => {
  switch (test.status) {
    case "draft":
      return {
        primary: { id: "publish", label: "Publish" },
        menu: [OPEN, { id: "regenerate", label: "Regenerate" }, { id: "duplicate", label: "Duplicate" }, DELETE],
      };
    case "scheduled":
      return { primary: { id: "start", label: "Start now" }, menu: [OPEN, DELETE] };
    case "live":
      return {
        primary: { id: "live", label: "Live view" },
        menu: [OPEN, { id: "stop", label: "Stop test", danger: true, separatorBefore: true }],
      };
    case "completed":
      return { primary: { id: "results", label: "Results" }, menu: [OPEN, DELETE] };
    default:
      return { primary: OPEN, menu: [] };
  }
};

export const statusCounts = (tests) => {
  const counts = { all: tests.length, draft: 0, scheduled: 0, live: 0, completed: 0 };
  tests.forEach((t) => {
    if (t.status in counts) counts[t.status] += 1;
  });
  return counts;
};

const opensFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** Second line under the status: when a scheduled test opens, or how far a live one is. */
export const statusNote = (test) => {
  if (test.status === "scheduled" && test.schedule?.availableFrom) {
    const when = new Date(test.schedule.availableFrom);
    return Number.isNaN(when.getTime()) ? null : `Opens ${opensFormat.format(when)}`;
  }
  if (test.status === "live" && test.progress) {
    const { submitted = 0, started = 0, expected = 0 } = test.progress;
    return expected > 0 ? `${submitted} of ${expected} submitted` : `${started} started`;
  }
  return null;
};
