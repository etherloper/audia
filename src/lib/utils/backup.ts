/**
 * Backup file format and the pure parts of restoring one (validation, matching
 * backed-up books to the library, merging bookmarks). DB access lives in
 * state/backup.ts.
 */

export const BACKUP_VERSION = 1;

export interface BackupBook {
  /** How to find this book in a library: same file, same folder, or same title + author */
  key: { first_file: string | null; folder_path: string; title: string; author: string };
  metadata: {
    title: string;
    author: string;
    narrator: string | null;
    description: string | null;
    series: string | null;
    series_index: number | null;
    /** Added in a later release; absent in older backups */
    genres?: string | null;
    tags?: string | null;
    is_favourite: number;
    /** A data: URL (embedded image), an https: URL, or null */
    cover: string | null;
  };
  progress: {
    chapter_index: number;
    position_secs: number;
    playback_rate: number;
    book_position_secs: number;
    listened_secs: number;
    finished_at: string | null;
    updated_at: string;
  } | null;
  bookmarks: BackupBookmark[];
  /** Daily listening time for this book (added in a later release; may be absent) */
  listening?: { day: string; seconds: number }[];
}

export interface BackupBookmark {
  chapter_index: number;
  position_secs: number;
  label: string | null;
  created_at: string;
}

export interface BackupFile {
  app: "audia";
  version: number;
  exported_at: string;
  settings: Record<string, string>;
  books: BackupBook[];
}

/** localStorage keys that are machine-specific and shouldn't travel in a backup. */
export const NON_PORTABLE_SETTINGS = new Set(["audia-audiobook-folder"]);

export function parseBackup(text: string): BackupFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  const d = data as Partial<BackupFile>;
  if (!d || d.app !== "audia" || !Array.isArray(d.books)) {
    throw new Error("That file isn't an Audia backup.");
  }
  if (typeof d.version !== "number" || d.version > BACKUP_VERSION) {
    throw new Error("This backup was made by a newer version of Audia. Update the app and try again.");
  }
  for (const b of d.books) {
    if (!b?.key || typeof b.key.title !== "string" || typeof b.key.author !== "string" || !b.metadata) {
      throw new Error("The backup file is damaged (a book entry is incomplete).");
    }
    if (!Array.isArray(b.bookmarks)) b.bookmarks = [];
  }
  return { ...d, settings: d.settings ?? {} } as BackupFile;
}

export interface LibraryBookRef {
  id: number;
  folder_path: string;
  title: string;
  author: string;
  first_file: string | null;
}

/**
 * Match backed-up books to library books, strongest evidence first across all
 * books (so a weak match can't take a book a strong one owns): same first audio
 * file, then same folder (only if just one book lives there), then title + author.
 * Returns the library id for each backup entry, or null if it isn't in the library.
 */
export function matchBackupBooks(entries: BackupBook[], library: LibraryBookRef[]): (number | null)[] {
  const result: (number | null)[] = entries.map(() => null);
  const taken = new Set<number>();
  const claim = (i: number, id: number | undefined) => {
    if (id !== undefined && result[i] === null && !taken.has(id)) {
      result[i] = id;
      taken.add(id);
    }
  };

  const byFile = new Map(library.filter((b) => b.first_file).map((b) => [b.first_file!, b.id]));
  entries.forEach((e, i) => e.key.first_file && claim(i, byFile.get(e.key.first_file)));

  entries.forEach((e, i) => {
    const inFolder = library.filter((b) => b.folder_path === e.key.folder_path && !taken.has(b.id));
    if (inFolder.length === 1) claim(i, inFolder[0].id);
  });

  entries.forEach((e, i) =>
    claim(i, library.find((b) => !taken.has(b.id) && b.title === e.key.title && b.author === e.key.author)?.id),
  );
  return result;
}

/** Backed-up bookmarks that aren't already present (same chapter, within half a second). */
export function newBookmarks(
  existing: { chapter_index: number; position_secs: number }[],
  incoming: BackupBookmark[],
): BackupBookmark[] {
  return incoming.filter(
    (b) => !existing.some((e) => e.chapter_index === b.chapter_index && Math.abs(e.position_secs - b.position_secs) < 0.5),
  );
}
