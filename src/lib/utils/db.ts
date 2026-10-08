import Database from "@tauri-apps/plugin-sql";

let db: Database | null = null;
let loading: Promise<Database> | null = null;

export async function getDb(): Promise<Database> {
  if (db) return db;
  // Share one load so concurrent callers don't run migrations twice
  loading ??= (async () => {
    const database = await Database.load("sqlite:audia.db");
    await runMigrations(database);
    db = database;
    return database;
  })();
  return loading;
}

/**
 * Ordered schema migrations. The index + 1 is the version stored in
 * `PRAGMA user_version`; each runs exactly once. Append new ones to the end —
 * never edit or reorder existing entries.
 */
const migrations: ((database: Database) => Promise<void>)[] = [
  // 1: Baseline. Databases created before versioning have user_version 0 but may
  // already have some of these columns, so this one step tolerates that.
  async (database) => {
    await database.execute(`
      CREATE TABLE IF NOT EXISTS books (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        author TEXT NOT NULL DEFAULT 'Unknown',
        cover_art TEXT,
        folder_path TEXT NOT NULL,
        total_duration_secs REAL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await database.execute(`
      CREATE TABLE IF NOT EXISTS chapters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        chapter_index INTEGER NOT NULL,
        title TEXT NOT NULL,
        file_path TEXT NOT NULL,
        duration_secs REAL DEFAULT 0,
        start_offset_secs REAL DEFAULT 0,
        UNIQUE(book_id, chapter_index)
      )
    `);
    await database.execute(`
      CREATE TABLE IF NOT EXISTS progress (
        book_id INTEGER PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
        chapter_index INTEGER NOT NULL DEFAULT 0,
        position_secs REAL NOT NULL DEFAULT 0,
        playback_rate REAL NOT NULL DEFAULT 1.0,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await database.execute(`
      CREATE TABLE IF NOT EXISTS bookmarks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        chapter_index INTEGER NOT NULL,
        position_secs REAL NOT NULL,
        label TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await addColumnIfMissing(database, "chapters", "start_offset_secs", "REAL DEFAULT 0");
    await addColumnIfMissing(database, "books", "is_favourite", "INTEGER DEFAULT 0");
    await addColumnIfMissing(database, "books", "description", "TEXT");
    await addColumnIfMissing(database, "books", "narrator", "TEXT");
    await addColumnIfMissing(database, "books", "series", "TEXT");
    await addColumnIfMissing(database, "books", "series_index", "REAL");
    await addColumnIfMissing(database, "progress", "listened_secs", "REAL DEFAULT 0");
  },

  // 2: Track position across the whole book and when it was finished.
  // position_secs is relative to the current chapter, so it can't tell how far
  // through a multi-chapter book you are on its own.
  async (database) => {
    await database.execute("ALTER TABLE progress ADD COLUMN book_position_secs REAL NOT NULL DEFAULT 0");
    await database.execute("ALTER TABLE progress ADD COLUMN finished_at TEXT");
    await database.execute(`
      UPDATE progress SET book_position_secs = position_secs + COALESCE((
        SELECT SUM(c.duration_secs) FROM chapters c
        WHERE c.book_id = progress.book_id AND c.chapter_index < progress.chapter_index
      ), 0)
    `);
    await database.execute(`
      UPDATE progress SET finished_at = updated_at
      WHERE book_position_secs >= 0.95 * (SELECT total_duration_secs FROM books WHERE books.id = progress.book_id)
        AND (SELECT total_duration_secs FROM books WHERE books.id = progress.book_id) > 0
    `);
  },

  // 3: Bookmarks used to get auto-generated labels like "Ch 3 @ 754s". The UI
  // now shows chapter and time itself, so the label is only for the user's note.
  async (database) => {
    await database.execute("UPDATE bookmarks SET label = NULL WHERE label LIKE 'Ch % @ %s'");
  },

  // 4: Remember when a book's cover/description was looked up online, so books
  // that aren't listed anywhere aren't looked up again on every scan.
  async (database) => {
    await database.execute("ALTER TABLE books ADD COLUMN cover_fetch_attempted_at TEXT");
  },

  // 5: Daily listening log for Stats (time per local day per book). Survives a
  // book being removed so history totals don't change.
  async (database) => {
    await database.execute(`
      CREATE TABLE listening_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        day TEXT NOT NULL,
        book_id INTEGER REFERENCES books(id) ON DELETE SET NULL,
        seconds REAL NOT NULL DEFAULT 0,
        UNIQUE(day, book_id)
      )
    `);
    await database.execute("CREATE INDEX listening_log_day ON listening_log(day)");
  },

  // 6: Genres (from the files' genre tags, editable) and the user's own tags.
  // Each is a list stored one value per line (see utils/tags.ts).
  async (database) => {
    await database.execute("ALTER TABLE books ADD COLUMN genres TEXT");
    await database.execute("ALTER TABLE books ADD COLUMN tags TEXT");
  },
];

async function addColumnIfMissing(database: Database, table: string, column: string, definition: string) {
  const cols = await database.select<{ name: string }[]>(`PRAGMA table_info(${table})`);
  if (!cols.some((c) => c.name === column)) {
    await database.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

async function runMigrations(database: Database): Promise<void> {
  const [{ user_version: current }] = await database.select<{ user_version: number }[]>("PRAGMA user_version");
  for (let version = current + 1; version <= migrations.length; version++) {
    await migrations[version - 1](database);
    await database.execute(`PRAGMA user_version = ${version}`);
  }
}
