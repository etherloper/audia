/**
 * Genres and tags are stored as text, one value per line, e.g. "Fantasy\nAdventure".
 * These helpers convert between that and lists, and clean up genres read from files.
 */

const fold = (s: string) => s.toLocaleLowerCase();

/** Parse a stored list. Blank entries and repeats (ignoring case) are dropped. */
export function parseList(text: string | null | undefined): string[] {
  if (!text) return [];
  return dedupe(text.split("\n"));
}

/** Store a list; null when empty. */
export function joinList(values: string[]): string | null {
  const clean = dedupe(values);
  return clean.length > 0 ? clean.join("\n") : null;
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = raw.replace(/\s+/g, " ").trim();
    if (!value || seen.has(fold(value))) continue;
    seen.add(fold(value));
    out.push(value);
  }
  return out;
}

/** Genre tags that say nothing about the book itself. */
const GENERIC = new Set(["audiobook", "audiobooks", "audio book", "audio books", "audio", "spoken word", "speech", "books", "book", "other", "genre", "unknown", "general"]);

/**
 * Turn a raw genre tag into a list: files use ";", ",", "/" or "|" between values,
 * ID3 can use NUL, and old ID3 numeric codes like "(101)" mean nothing to people.
 */
export function genresFromTag(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return dedupe(
    raw
      .split(/[;,/|\u0000]+/)
      .map((g) => g.replace(/^\(\d+\)/, "").trim())
      .filter((g) => g && !/^\d+$/.test(g) && !GENERIC.has(fold(g))),
  );
}

/** Does a book's list contain `name` (ignoring case)? */
export function listHas(text: string | null | undefined, name: string): boolean {
  const target = fold(name);
  return parseList(text).some((v) => fold(v) === target);
}

/** Every distinct value across books with how many books have it, most common first. */
export function countValues(texts: (string | null | undefined)[]): { name: string; count: number }[] {
  const counts = new Map<string, { name: string; count: number }>();
  for (const text of texts) {
    for (const value of parseList(text)) {
      const entry = counts.get(fold(value));
      if (entry) entry.count++;
      else counts.set(fold(value), { name: value, count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
