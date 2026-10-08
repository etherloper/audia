const SHORTCUT = /\s*\(((?:Ctrl|Shift|Alt|Esc|Space|Enter|[A-Z0-9])(?:[+ ][^()]*)?)\)\s*$/;

/**
 * Split a trailing keyboard shortcut off a tooltip so it can be shown as a key:
 * "Search (Ctrl+K)" → ["Search", "Ctrl+K"]. Ordinary brackets stay in the text.
 */
export function splitShortcut(text: string): [string, string | null] {
  const match = text.match(SHORTCUT);
  if (!match || match.index === 0) return [text, null];
  return [text.slice(0, match.index), match[1]];
}
