import { useEffect, useState } from "react";

/**
 * The current time, refreshed every `intervalMs`, for anything that shows or
 * compares with "now" while rendering (a render itself must not read the clock).
 * Pass `enabled = false` to stop the timer (e.g. while a dialog is closed).
 */
export const useNow = (intervalMs, enabled = true) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return undefined;
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs, enabled]);
  return now;
};
