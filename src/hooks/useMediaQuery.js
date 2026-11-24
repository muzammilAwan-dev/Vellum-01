import { useSyncExternalStore } from "react";

/**
 * Live `window.matchMedia` result. Safe on first render (no flash: the value is
 * read synchronously) and keeps up with window resizes / rotation.
 * Breakpoints must match the `@theme` values in styles/index.css.
 */
export const useMediaQuery = (query) =>
  useSyncExternalStore(
    (notify) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", notify);
      return () => mq.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );

/** `tablet` breakpoint (860 px): the sidebar is pinned beside the page from here up. */
export const useIsDesktop = () => useMediaQuery("(min-width: 860px)");
