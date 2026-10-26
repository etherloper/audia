/** True on macOS, where shortcuts use ⌘ (Command) instead of Ctrl. */
export const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.userAgent);

/** The shortcut modifier as shown to the user: "⌘" on macOS, "Ctrl" elsewhere. */
export const modKey = isMac ? "⌘" : "Ctrl";

/** Shift as shown to the user: "⇧" on macOS, "Shift" elsewhere. */
export const shiftKey = isMac ? "⇧" : "Shift";

/** The platform's shortcut modifier is held (⌘ on macOS, Ctrl elsewhere). */
export const hasModKey = (e: KeyboardEvent | MouseEvent) => (isMac ? e.metaKey : e.ctrlKey);
