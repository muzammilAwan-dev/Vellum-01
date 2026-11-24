import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { logFlag } from "@/api/attempts";
import { enterFullscreen, fullscreenState, leaveFullscreen, watchTestPage } from "@/lib/antiCheat";

/**
 * Watches the test page for things a student shouldn't be doing and reports
 * each one (POST /api/tests/:id/flag). The rules themselves are in
 * lib/antiCheat.js (watchTestPage); this wires them to a React component.
 * Active only while `active` is true.
 *
 *   const { fullscreen, reenterFullscreen, finishTest } = useAntiCheat({
 *     testId, active, requireFullscreen, blockCopyPaste, onFlag,
 *   });
 *
 * `fullscreen` is true for the Fullscreen API *and* for F11-style browser
 * fullscreen. `onFlag(type)` runs for every report. `reenterFullscreen()` must
 * be called from a click. Call `finishTest()` once the test has been submitted:
 * it silences the watcher and hands the screen back, so leaving fullscreen
 * then isn't reported (do this from the submit handler — not from an effect
 * cleanup, which React StrictMode also runs on a development-only remount).
 */
export const useAntiCheat = ({ testId, active, requireFullscreen, blockCopyPaste, onFlag }) => {
  const [fullscreen, setFullscreen] = useState(() => fullscreenState().active);
  const onFlagRef = useRef(onFlag);
  useLayoutEffect(() => {
    onFlagRef.current = onFlag; // latest callback, set after render rather than during it
  }, [onFlag]);
  const throttle = useRef({}); // survives a StrictMode remount, so nothing is reported twice
  const watcher = useRef(null);

  useEffect(() => {
    if (!active) return undefined;
    const w = watchTestPage({
      requireFullscreen,
      blockCopyPaste,
      throttle: throttle.current,
      onFullscreen: setFullscreen,
      report: (type) => {
        onFlagRef.current?.(type);
        logFlag(testId, type).catch(() => {}); // best effort — never interrupt the test
      },
    });
    watcher.current = w;
    return () => {
      w.stop();
      if (watcher.current === w) watcher.current = null;
    };
  }, [active, requireFullscreen, blockCopyPaste, testId]);

  const reenterFullscreen = useCallback(async () => {
    const ok = await enterFullscreen();
    setFullscreen(ok);
    return ok;
  }, []);

  const finishTest = useCallback(() => {
    watcher.current?.pause();
    return leaveFullscreen();
  }, []);

  return { fullscreen, reenterFullscreen, finishTest };
};
