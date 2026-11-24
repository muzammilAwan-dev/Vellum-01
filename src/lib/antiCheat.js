// ═══════════════════════════════════════════════════════════════
// ANTI-CHEAT: the events a student's browser can report during a test, and
// small helpers around the Fullscreen API. The server stores them as
// `attempt.flags: [{ type, at }]`; teachers see them labelled.
// ═══════════════════════════════════════════════════════════════
export const FLAG_TYPES = {
  "tab-switch": { label: "Switched tab or window", severity: "high" },
  "window-blur": { label: "Clicked outside the test window", severity: "medium" },
  "fullscreen-exit": { label: "Left fullscreen", severity: "high" },
  "fullscreen-denied": { label: "Fullscreen unavailable", severity: "low" },
  "right-click": { label: "Tried to open the context menu", severity: "low" },
  copy: { label: "Tried to copy", severity: "medium" },
  cut: { label: "Tried to cut", severity: "medium" },
  paste: { label: "Tried to paste", severity: "medium" },
  "page-leave-attempt": { label: "Tried to leave or reload the page", severity: "medium" },
  "devtools-shortcut": { label: "Pressed a developer-tools shortcut", severity: "low" },
};

export const flagLabel = (type) => FLAG_TYPES[type]?.label ?? type;

export const fullscreenSupported = () =>
  typeof document !== "undefined" && !!document.documentElement?.requestFullscreen;

const SCREEN_TOLERANCE_PX = 2;

/**
 * Is the page fullscreen — by ANY route? The Fullscreen API (our button, or the
 * element requested on Begin) sets `document.fullscreenElement`. The browser's
 * own fullscreen (F11, or the macOS green button) does NOT: it sets nothing
 * and fires no `fullscreenchange`, only `resize`. So three signals are combined:
 *   1. document.fullscreenElement            (Fullscreen API)
 *   2. matchMedia("(display-mode: fullscreen)")   (browsers that report either kind)
 *   3. the window covering the whole screen  (outer size == screen size; the
 *      outer size ignores page zoom and docked devtools, unlike innerHeight)
 * `kind` says which: "api" | "browser" | null.
 */
export const fullscreenState = (doc = document, win = window) => {
  if (doc.fullscreenElement) return { active: true, kind: "api" };
  const media = win.matchMedia?.("(display-mode: fullscreen)")?.matches;
  const screenSize = win.screen;
  const covers =
    !!screenSize &&
    win.outerWidth >= screenSize.width - SCREEN_TOLERANCE_PX &&
    win.outerHeight >= screenSize.height - SCREEN_TOLERANCE_PX;
  return media || covers ? { active: true, kind: "browser" } : { active: false, kind: null };
};

export const isFullscreen = () => typeof document !== "undefined" && fullscreenState().active;

/**
 * Ask the browser for fullscreen. Browsers only allow this straight after a
 * click, so call it from the click handler (before awaiting anything else).
 * Resolves true if the page is now fullscreen (including if it already was,
 * e.g. via F11).
 */
export const enterFullscreen = async () => {
  if (isFullscreen()) return true;
  if (!fullscreenSupported()) return false;
  try {
    await document.documentElement.requestFullscreen();
    return true;
  } catch {
    return false;
  }
};

/** Hand the screen back. Safe to call when not in the Fullscreen API's fullscreen. */
export const leaveFullscreen = async () => {
  if (typeof document !== "undefined" && document.fullscreenElement) {
    try {
      await document.exitFullscreen();
    } catch {
      /* already out */
    }
  }
};

/**
 * Is this keydown a shortcut that opens developer tools or view-source?
 * Only a clue: it proves a key was pressed, not that anything opened (and the
 * browser menu opens DevTools with no keys at all). It is logged, never blocked.
 * Uses `event.code`, because with Option held on a Mac `event.key` is a symbol.
 */
export const isDevToolsShortcut = (e) => {
  const code = e.code;
  if (code === "F12") return true;
  if (e.ctrlKey && e.shiftKey && ["KeyI", "KeyJ", "KeyC", "KeyK"].includes(code)) return true; // Win/Linux (K = Firefox console)
  if (e.metaKey && e.altKey && ["KeyI", "KeyJ", "KeyC", "KeyU"].includes(code)) return true; // macOS
  if (e.metaKey && e.shiftKey && code === "KeyC") return true; // macOS inspect element
  if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && code === "KeyU") return true; // view source
  return false;
};

const THROTTLE_MS = 800; // one report per type per moment (a held key would flood)
const BLUR_GRACE_MS = 150; // a tab switch fires blur first; let visibilitychange claim it
const RESIZE_SETTLE_MS = 200; // F11 resizes in steps; judge the final size, not the animation

/**
 * Starts watching a test page; returns { stop, pause }. All the browser rules
 * live here (the hook just wires them to React), so they can be tested with
 * fake `doc` / `win` objects.
 *
 *   report(type)            called for every event worth recording (throttled)
 *   onFullscreen(boolean)   called when fullscreen turns on or off (either kind)
 *   requireFullscreen       not fullscreen at the start → "fullscreen-denied";
 *                           leaving it later (Esc, F11, anything) → "fullscreen-exit"
 *   blockCopyPaste          right-click / copy / cut / paste are cancelled + reported
 *   throttle                object remembering when each type was last sent. Pass
 *                           the same one to a re-started watcher (React StrictMode
 *                           remounts in development) so it doesn't report twice.
 *
 * Always on: tab hidden → "tab-switch"; focus lost while still visible →
 * "window-blur"; reload/close/back → the browser's leave prompt + "page-leave-attempt";
 * DevTools / view-source keyboard shortcuts → "devtools-shortcut" (logged only,
 * never blocked — blocking F12 is trivially bypassed and hurts accessibility).
 *
 * stop()   removes every listener.
 * pause()  ignores everything from now on — call it right before *we* leave
 *          fullscreen (after submitting) so that exit isn't reported.
 */
export const watchTestPage = ({
  doc = document,
  win = window,
  report,
  onFullscreen = () => {},
  requireFullscreen = false,
  blockCopyPaste = false,
  throttle = {},
  now = Date.now,
}) => {
  let paused = false;
  const send = (type) => {
    if (paused) return;
    const t = now();
    if (t - (throttle[type] ?? -Infinity) < THROTTLE_MS) return;
    throttle[type] = t;
    report(type);
  };
  const cleanups = [];
  const on = (target, event, handler) => {
    target.addEventListener(event, handler);
    cleanups.push(() => target.removeEventListener(event, handler));
  };

  // Fullscreen: remember the last state; only a true → false change is an exit.
  let wasFullscreen = fullscreenState(doc, win).active;
  onFullscreen(wasFullscreen);
  if (requireFullscreen && !wasFullscreen) send("fullscreen-denied");
  const recheck = () => {
    const now_ = fullscreenState(doc, win).active;
    if (now_ === wasFullscreen) return;
    wasFullscreen = now_;
    if (!paused) onFullscreen(now_);
    if (!now_ && requireFullscreen) send("fullscreen-exit");
  };
  on(doc, "fullscreenchange", recheck); // the Fullscreen API
  let resizeTimer;
  on(win, "resize", () => {
    // F11 / the green button: no fullscreenchange, only resize.
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(recheck, RESIZE_SETTLE_MS);
  });
  cleanups.push(() => clearTimeout(resizeTimer));
  const media = win.matchMedia?.("(display-mode: fullscreen)");
  if (media?.addEventListener) on(media, "change", recheck);

  let blurTimer;
  on(doc, "visibilitychange", () => {
    if (doc.hidden) send("tab-switch");
  });
  on(win, "blur", () => {
    clearTimeout(blurTimer);
    blurTimer = setTimeout(() => {
      if (!doc.hidden && !doc.hasFocus()) send("window-blur");
    }, BLUR_GRACE_MS);
  });
  on(win, "focus", () => clearTimeout(blurTimer));
  cleanups.push(() => clearTimeout(blurTimer));

  if (blockCopyPaste) {
    [["contextmenu", "right-click"], ["copy", "copy"], ["cut", "cut"], ["paste", "paste"]].forEach(([event, type]) =>
      on(doc, event, (e) => {
        if (paused) return;
        e.preventDefault();
        send(type);
      }),
    );
  }

  on(doc, "keydown", (e) => {
    if (!paused && isDevToolsShortcut(e)) send("devtools-shortcut");
  });

  on(win, "beforeunload", (e) => {
    if (paused) return;
    send("page-leave-attempt");
    e.preventDefault();
    e.returnValue = ""; // some browsers need this to show the prompt
  });

  return {
    stop: () => cleanups.forEach((fn) => fn()),
    pause: () => {
      paused = true;
    },
  };
};
