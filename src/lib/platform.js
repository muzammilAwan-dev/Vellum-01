// Keyboard-hint helpers. Apple devices show ⌘, everything else Ctrl.
// userAgentData is preferred (navigator.platform is deprecated); iPadOS in
// desktop mode reports "MacIntel", which is right: its keyboard uses ⌘.
const platformName = () =>
  typeof navigator === "undefined" ? "" : navigator.userAgentData?.platform || navigator.platform || "";

export const isMacLike = () => /mac|iphone|ipad|ipod/i.test(platformName());

export const modKeyLabel = () => (isMacLike() ? "⌘" : "Ctrl");

/** "⌘K" on Apple devices, "Ctrl+K" elsewhere. */
export const shortcutLabel = (key) => (isMacLike() ? `⌘${key}` : `Ctrl+${key}`);
