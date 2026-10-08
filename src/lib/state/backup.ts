import { invoke } from "@tauri-apps/api/core";
import type { Book, Bookmark, Progress } from "../types";
import { getDb } from "../utils/db";
import {
  BACKUP_VERSION,
  matchBackupBooks,
  newBookmarks,
  NON_PORTABLE_SETTINGS,
  parseBackup,
  type BackupBook,
  type BackupFile,
} from "../utils/backup";
import { playerState } from "./player.svelte";

/** Every setting this app keeps in localStorage (all prefixed "audia-"). */
function readSettings(): Record<string, string> {
  const settings: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("audia-") && !NON_PORTABLE_SETTINGS.has(key)) {
        settings[key] = localStorage.getItem(key) ?? "";
      }
    }
  } catch {
    // Storage unavailable — back up without settings
  }
  return settings;
}

const isLocalCover = (cover: string | null): cover is string => !!cover && !/^(https?|data):/i.test(cover);

/**
 * Write a backup file. Returns the saved path, or null if the user cancelled.
 */
export async function createBackup(): Promise<string | null> {
  await playerState.saveProgress().catch(() => {});
  const db = await getDb();
  const books = await db.select<(Book & { first_file: string | null })[]>(
    `SELECT b.*, (SELECT file_path FROM chapters c WHERE c.book_id = b.id ORDER BY chapter_index LIMIT 1) AS first_file
     FROM books b`,
  );
  const progress = await db.select<Progress[]>("SELECT * FROM progress");
  const bookmarks = await db.select<Bookmark[]>("SELECT * FROM bookmarks ORDER BY chapter_index, position_secs");
  const listening = await db.select<{ book_id: number; day: string; seconds: number }[]>(
    "SELECT book_id, day, seconds FROM listening_log WHERE book_id IS NOT NULL ORDER BY day",
  );

  // Embed locally stored covers so the backup works on another computer
  const covers = await invoke<Record<string, string>>("read_covers", {
    paths: books.map((b) => b.cover_art).filter(isLocalCover),
  });

  const progressByBook = new Map(progress.map((p) => [p.book_id, p]));
  const entries: BackupBook[] = books.map((b) => {
    const p = progressByBook.get(b.id);
    return {
      key: { first_file: b.first_file, folder_path: b.folder_path, title: b.title, author: b.author },
      metadata: {
        title: b.title,
        author: b.author,
        narrator: b.narrator,
        description: b.description,
        series: b.series,
        series_index: b.series_index,
        genres: b.genres ?? null,
        tags: b.tags ?? null,
        is_favourite: b.is_favourite ?? 0,
        cover: isLocalCover(b.cover_art) ? (covers[b.cover_art] ?? null) : b.cover_art,
      },
      progress: p
        ? {
            chapter_index: p.chapter_index,
            position_secs: p.position_secs,
            playback_rate: p.playback_rate,
            book_position_secs: p.book_position_secs ?? 0,
            listened_secs: p.listened_secs ?? 0,
            finished_at: p.finished_at,
            updated_at: p.updated_at,
          }
        : null,
      bookmarks: bookmarks
        .filter((m) => m.book_id === b.id)
        .map((m) => ({ chapter_index: m.chapter_index, position_secs: m.position_secs, label: m.label, created_at: m.created_at })),
      listening: listening.filter((l) => l.book_id === b.id).map((l) => ({ day: l.day, seconds: l.seconds })),
    };
  });

  const backup: BackupFile = {
    app: "audia",
    version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    settings: readSettings(),
    books: entries,
  };
  const date = new Date().toISOString().slice(0, 10);
  return invoke<string | null>("save_backup_file", {
    contents: JSON.stringify(backup),
    defaultName: `audia-backup-${date}.json`,
  });
}

export interface RestorePlan {
  backup: BackupFile;
  /** Library book id for each backup entry, or null if not in this library */
  matches: (number | null)[];
  matched: number;
  missing: number;
  bookmarkCount: number;
  settingsCount: number;
}

/**
 * Let the user pick a backup file and work out what restoring it would do.
 * Returns null if they cancelled. Throws with a readable message if the file is bad.
 */
export async function prepareRestore(): Promise<RestorePlan | null> {
  const text = await invoke<string | null>("open_backup_file");
  if (text === null) return null;
  const backup = parseBackup(text);

  const db = await getDb();
  const library = await db.select<{ id: number; folder_path: string; title: string; author: string; first_file: string | null }[]>(
    `SELECT b.id, b.folder_path, b.title, b.author,
       (SELECT file_path FROM chapters c WHERE c.book_id = b.id ORDER BY chapter_index LIMIT 1) AS first_file
     FROM books b`,
  );
  const matches = matchBackupBooks(backup.books, library);
  const matched = matches.filter((m) => m !== null).length;
  return {
    backup,
    matches,
    matched,
    missing: matches.length - matched,
    bookmarkCount: backup.books.reduce((n, b, i) => n + (matches[i] !== null ? b.bookmarks.length : 0), 0),
    settingsCount: Object.keys(backup.settings).filter((k) => !NON_PORTABLE_SETTINGS.has(k)).length,
  };
}

/**
 * Apply a restore: for each matched book, replace metadata and progress with the
 * backup's and add any bookmarks it doesn't already have; then restore settings.
 * The caller should reload the app afterwards.
 */
export async function applyRestore(plan: RestorePlan): Promise<void> {
  // Stop playback without saving, so the player can't overwrite restored progress
  playerState.clearState();
  const db = await getDb();

  for (let i = 0; i < plan.backup.books.length; i++) {
    const bookId = plan.matches[i];
    if (bookId === null) continue;
    const { metadata: m, progress: p, bookmarks, listening = [] } = plan.backup.books[i];

    let cover: string | null = null;
    if (m.cover?.startsWith("data:")) {
      cover = await invoke<string>("save_cover_data_url", { dataUrl: m.cover }).catch(() => null);
    } else if (m.cover) {
      cover = m.cover;
    }
    await db.execute(
      `UPDATE books SET title = $1, author = $2, narrator = $3, description = $4, series = $5,
         series_index = $6, is_favourite = $7, cover_art = COALESCE($8, cover_art),
         genres = CASE WHEN $10 THEN $11 ELSE genres END,
         tags = CASE WHEN $10 THEN $12 ELSE tags END
       WHERE id = $9`,
      // Older backups have no genres/tags: keep the library's own rather than clearing them
      [m.title, m.author, m.narrator, m.description, m.series, m.series_index, m.is_favourite, cover, bookId, m.genres !== undefined, m.genres ?? null, m.tags ?? null],
    );

    if (p) {
      await db.execute(
        `INSERT INTO progress (book_id, chapter_index, position_secs, playback_rate, book_position_secs, listened_secs, finished_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT(book_id) DO UPDATE SET
           chapter_index = $2, position_secs = $3, playback_rate = $4, book_position_secs = $5,
           listened_secs = $6, finished_at = $7, updated_at = $8`,
        [bookId, p.chapter_index, p.position_secs, p.playback_rate, p.book_position_secs, p.listened_secs, p.finished_at, p.updated_at],
      );
    }

    const existing = await db.select<{ chapter_index: number; position_secs: number }[]>(
      "SELECT chapter_index, position_secs FROM bookmarks WHERE book_id = $1",
      [bookId],
    );
    for (const b of newBookmarks(existing, bookmarks)) {
      await db.execute(
        "INSERT INTO bookmarks (book_id, chapter_index, position_secs, label, created_at) VALUES ($1, $2, $3, $4, $5)",
        [bookId, b.chapter_index, b.position_secs, b.label, b.created_at || new Date().toISOString()],
      );
    }

    // Keep the larger figure per day, so restoring twice doesn't double-count
    for (const day of listening) {
      await db.execute(
        `INSERT INTO listening_log (day, book_id, seconds) VALUES ($1, $2, $3)
         ON CONFLICT(day, book_id) DO UPDATE SET seconds = MAX(seconds, $3)`,
        [day.day, bookId, day.seconds],
      );
    }
  }

  try {
    for (const [key, value] of Object.entries(plan.backup.settings)) {
      if (key.startsWith("audia-") && !NON_PORTABLE_SETTINGS.has(key)) localStorage.setItem(key, value);
    }
  } catch {
    // Settings couldn't be written — library data is still restored
  }
}
