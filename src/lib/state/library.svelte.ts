import type { Book, BookGroup, Bookmark, Chapter, FilterOption, GroupByOption, ScannedBook, SortOption, Progress } from "../types";
import { getDb } from "../utils/db";
import { fetchBookCover } from "../utils/covers";
import { countValues, genresFromTag, joinList, listHas, parseList } from "../utils/tags";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import type Database from "@tauri-apps/plugin-sql";
import { uiState } from "./ui.svelte";
import { remapPosition } from "../utils/playback";
import { logError, logWarn } from "../utils/log";
import { SORT_LABELS, compareNames, sortBooks } from "../utils/librarySort";

function createLibraryState() {
  let books = $state<Book[]>([]);
  let chapters = $state<Map<number, Chapter[]>>(new Map());
  let progressMap = $state<Map<number, Progress>>(new Map());
  let searchQuery = $state("");
  // Sort and grouping are remembered between launches
  const storedSort = localStorage.getItem("audia-sort");
  const storedGroup = localStorage.getItem("audia-group");
  let sortBy = $state<SortOption>(storedSort && storedSort in SORT_LABELS ? (storedSort as SortOption) : "title");
  let groupBy = $state<GroupByOption>(
    storedGroup === "author" || storedGroup === "series" || storedGroup === "genre" ? storedGroup : "none",
  );
  let filterBy = $state<FilterOption>("all");
  /** Show only books with this genre or tag (set from the library's menu, a chip or quick search) */
  let tagFilter = $state<{ kind: "genre" | "tag"; name: string } | null>(null);
  // Settings → "Find missing covers & descriptions": progress, kept here so it
  // carries on (and stays visible) if you leave Settings while it runs
  let detailsSearch = $state<{ done: number; total: number } | null>(null);
  let detailsSearchCancelled = false;
  let viewMode = $state<"grid" | "list">(localStorage.getItem("audia-library-view") === "list" ? "list" : "grid");
  let pendingImports = $state(0);
  /** True once the library has been read from the database at startup. */
  let loaded = $state(false);
  let isImporting = $derived(pendingImports > 0);
  // Imports run one at a time: the folder watcher and drag-drop can both start
  // one, and overlapping scans would insert the same book twice.
  let importQueue: Promise<void> = Promise.resolve();
  // Bumped whenever bookmarks change so views can reload them
  let bookmarksVersion = $state(0);
  let audiobookFolder = $state<string>(localStorage.getItem("audia-audiobook-folder") || "");
  let watcherListening = false;
  // A drag-and-drop copy is writing into the library; it rescans when done, so
  // watcher events in the meantime (half-copied files) are ignored.
  let copyInProgress = false;

  const trimSlashes = (p: string) => p.replace(/[\\/]+$/, "");

  // "Remove from Library" waits this long before deleting, so it can be undone.
  // Until then the book is only hidden (see loadBooks).
  const UNDO_MS = 8000;
  const pendingRemovals = new Map<number, ReturnType<typeof setTimeout>>();

  function isFinished(bookId: number): boolean {
    return !!progressMap.get(bookId)?.finished_at;
  }

  type ChapterRow = Pick<Chapter, "book_id" | "chapter_index" | "title" | "file_path" | "duration_secs" | "start_offset_secs">;
  type ScannedFile = ScannedBook["files"][number];

  const sameChapters = (old: ChapterRow[], files: ScannedFile[]) =>
    old.length === files.length &&
    old.every(
      (c, i) =>
        c.title === files[i].title &&
        c.file_path === files[i].file_path &&
        Math.abs(c.duration_secs - files[i].duration_secs) < 0.01 &&
        Math.abs(c.start_offset_secs - files[i].start_offset_secs) < 0.01,
    );

  async function insertChapters(db: Database, bookId: number, files: ScannedFile[]) {
    // Multi-row inserts, chunked to stay well under SQLite's parameter limit
    const CHUNK = 400;
    for (let start = 0; start < files.length; start += CHUNK) {
      const rows = files.slice(start, start + CHUNK);
      const params: unknown[] = [];
      const values = rows.map((f, j) => {
        const n = params.length;
        params.push(bookId, start + j, f.title, f.file_path, f.duration_secs, f.start_offset_secs);
        return `($${n + 1}, $${n + 2}, $${n + 3}, $${n + 4}, $${n + 5}, $${n + 6})`;
      });
      await db.execute(
        `INSERT INTO chapters (book_id, chapter_index, title, file_path, duration_secs, start_offset_secs) VALUES ${values.join(", ")}`,
        params,
      );
    }
  }

  function isInsideFolder(bookPath: string, rootPath: string): boolean {
    if (!rootPath) return false;
    const norm = (p: string) => p.replace(/[\\/]+$/, "").toLowerCase();
    const root = norm(rootPath);
    const book = norm(bookPath);
    return book === root || book.startsWith(root + "\\") || book.startsWith(root + "/");
  }

  async function stopPlayerIfPlaying(bookIds: number[]): Promise<void> {
    if (bookIds.length === 0) return;
    const { playerState } = await import("./player.svelte");
    if (playerState.currentBookId !== null && bookIds.includes(playerState.currentBookId)) {
      playerState.clearState();
    }
  }

  /**
   * Older versions stored covers as base64 data URLs in the books table, which made
   * every `SELECT * FROM books` drag megabytes of image data. Move them to disk.
   */
  async function migrateInlineCovers(): Promise<void> {
    const db = await getDb();
    const rows = await db.select<{ id: number }[]>(
      "SELECT id FROM books WHERE cover_art LIKE 'data:%'",
    );
    if (rows.length === 0) return;
    for (const { id } of rows) {
      const [row] = await db.select<{ cover_art: string }[]>(
        "SELECT cover_art FROM books WHERE id = $1",
        [id],
      );
      try {
        const path = await invoke<string>("save_cover_data_url", { dataUrl: row.cover_art });
        await db.execute("UPDATE books SET cover_art = $1 WHERE id = $2", [path, id]);
      } catch {
        // Unreadable image — drop it so the auto-fetch can find a replacement
        await db.execute("UPDATE books SET cover_art = NULL WHERE id = $1", [id]);
      }
    }
    // Reclaim the space the inline images used
    try {
      await db.execute("VACUUM");
    } catch {
      // Not critical
    }
  }

  async function pruneCovers(): Promise<void> {
    const db = await getDb();
    const rows = await db.select<{ cover_art: string }[]>(
      "SELECT cover_art FROM books WHERE cover_art IS NOT NULL",
    );
    try {
      await invoke("prune_covers", { keep: rows.map((r) => r.cover_art) });
    } catch {
      // Not critical
    }
  }

  let filteredBooks = $derived.by(() => {
    let result = books;

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((b) =>
        [b.title, b.author, b.narrator, b.series, b.description, b.genres, b.tags].some((field) =>
          field?.toLowerCase().includes(q),
        ),
      );
    }

    if (tagFilter) {
      const { kind, name } = tagFilter;
      result = result.filter((b) => listHas(kind === "genre" ? b.genres : b.tags, name));
    }

    // Status filter
    if (filterBy !== "all") {
      result = result.filter((b) => {
        if (filterBy === "favourites") {
          return b.is_favourite === 1;
        }
        const prog = progressMap.get(b.id);
        const finished = isFinished(b.id);
        const started = !!prog && prog.book_position_secs > 0;
        if (filterBy === "not-started") return !started && !finished;
        if (filterBy === "finished") return finished;
        if (filterBy === "in-progress") return started && !finished;
        return true;
      });
    }

    return sortBooks(result, sortBy, progressMap);
  });

  const NO_GENRE = "No genre";

  /** Every genre and tag in the library, most common first. */
  let allGenres = $derived(countValues(books.map((b) => b.genres)));
  let allTags = $derived(countValues(books.map((b) => b.tags)));

  let groupedBooks = $derived.by((): BookGroup[] => {
    if (groupBy === "none") {
      return [{ label: "", books: filteredBooks }];
    }

    const groups = new Map<string, Book[]>();
    const add = (key: string, book: Book) => {
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(book);
    };
    for (const book of filteredBooks) {
      if (groupBy === "author") {
        add(book.author || "Unknown", book);
      } else if (groupBy === "genre") {
        // A book with several genres appears under each of them
        const genres = parseList(book.genres);
        if (genres.length === 0) add(NO_GENRE, book);
        for (const g of genres) add(g, book);
      } else {
        // series — use the series metadata field, fall back to standalone
        add(book.series || "Standalone", book);
      }
    }

    return Array.from(groups.entries())
      .sort(([a], [b]) => {
        // Put the catch-all group last
        if (a === "Standalone" || a === NO_GENRE) return 1;
        if (b === "Standalone" || b === NO_GENRE) return -1;
        return compareNames(a, b);
      })
      .map(([label, bks]) => ({
        label,
        // Sort books within series groups by series_index
        books: groupBy === "series"
          ? [...bks].sort((a, b) => (a.series_index ?? 999) - (b.series_index ?? 999))
          : bks,
      }));
  });

  return {
    get books() {
      return books;
    },
    get filteredBooks() {
      return filteredBooks;
    },
    get groupedBooks() {
      return groupedBooks;
    },
    get searchQuery() {
      return searchQuery;
    },
    set searchQuery(v: string) {
      searchQuery = v;
    },
    get sortBy() {
      return sortBy;
    },
    set sortBy(v: SortOption) {
      sortBy = v;
      localStorage.setItem("audia-sort", v);
    },
    get groupBy() {
      return groupBy;
    },
    set groupBy(v: GroupByOption) {
      groupBy = v;
      localStorage.setItem("audia-group", v);
    },
    get filterBy() {
      return filterBy;
    },
    get detailsSearch() {
      return detailsSearch;
    },
    /** Books with no cover or no description, which "find missing" would look up. */
    get missingDetailsCount() {
      return books.filter((b) => !b.cover_art || !b.description?.trim()).length;
    },

    /**
     * Look up covers and descriptions online for every book missing either, three at
     * a time. Only fills gaps; nothing already set is replaced.
     */
    async findMissingDetails(): Promise<void> {
      if (detailsSearch) return;
      const queue = books.filter((b) => !b.cover_art || !b.description?.trim());
      if (queue.length === 0) return;
      detailsSearch = { done: 0, total: queue.length };
      detailsSearchCancelled = false;
      let updated = 0;
      let reachable = false;
      const db = await getDb();

      const worker = async () => {
        for (let book = queue.shift(); book && !detailsSearchCancelled; book = queue.shift()) {
          try {
            const result = await fetchBookCover(book.title, book.author);
            reachable ||= result.reachable;
            const cover = !book.cover_art ? result.coverUrl : null;
            const description = !book.description?.trim() ? result.description : null;
            if (cover || description) {
              await db.execute(
                `UPDATE books SET cover_art = COALESCE($1, cover_art), description = COALESCE($2, description),
                   updated_at = datetime('now') WHERE id = $3`,
                [cover, description, book.id],
              );
              updated++;
              // Show results as they arrive, without reloading for every single book
              if (updated % 10 === 0) await this.loadBooks();
            }
          } catch {
            // Skip this book
          }
          if (detailsSearch) detailsSearch = { ...detailsSearch, done: detailsSearch.done + 1 };
        }
      };
      try {
        await Promise.all([worker(), worker(), worker()]);
        await this.loadBooks();
      } finally {
        const total = detailsSearch?.total ?? 0;
        detailsSearch = null;
        if (detailsSearchCancelled) uiState.showToast(`Stopped. Updated ${updated} ${updated === 1 ? "book" : "books"}.`);
        else if (!reachable) uiState.showToast("Couldn't reach Open Library or Google Books. Check your connection.", { kind: "error" });
        else uiState.showToast(`Found details for ${updated} of ${total} ${total === 1 ? "book" : "books"}.`, { kind: "success" });
      }
    },

    cancelDetailsSearch(): void {
      detailsSearchCancelled = true;
    },

    get tagFilter() {
      return tagFilter;
    },
    set tagFilter(v: { kind: "genre" | "tag"; name: string } | null) {
      tagFilter = v;
    },
    get allGenres() {
      return allGenres;
    },
    get allTags() {
      return allTags;
    },

    /** Covers in a grid, or a compact sortable list. */
    get viewMode() {
      return viewMode;
    },
    set viewMode(v: "grid" | "list") {
      viewMode = v;
      localStorage.setItem("audia-library-view", v);
    },
    set filterBy(v: FilterOption) {
      filterBy = v;
    },
    get loaded() {
      return loaded;
    },
    get isImporting() {
      return isImporting;
    },
    get bookmarksVersion() {
      return bookmarksVersion;
    },
    get progressMap() {
      return progressMap;
    },
    get audiobookFolder() {
      return audiobookFolder;
    },

    getChapters(bookId: number): Chapter[] {
      return chapters.get(bookId) || [];
    },

    isFinished,

    /** 0–1 progress through the whole book. */
    progressFraction(book: Book): number {
      const prog = progressMap.get(book.id);
      if (!prog) return 0;
      if (prog.finished_at) return 1;
      if (book.total_duration_secs <= 0) return 0;
      return Math.min(1, prog.book_position_secs / book.total_duration_secs);
    },

    /** Startup: move legacy inline covers to disk, load the library, then clean up unused cover files. */
    async init(): Promise<void> {
      await migrateInlineCovers();
      await this.loadBooks();
      loaded = true;
      // Audio is served over the asset protocol, which only allows the covers dir
      // by default — open up the folders the library already knows about.
      const folders = [...new Set(books.map((b) => b.folder_path))];
      if (audiobookFolder) folders.push(audiobookFolder);
      await invoke("allow_library_paths", { paths: folders }).catch(() => {});
      await pruneCovers();
    },

    async loadBooks(): Promise<void> {
      const db = await getDb();
      const rows = await db.select<Book[]>("SELECT * FROM books ORDER BY updated_at DESC");
      books = pendingRemovals.size > 0 ? rows.filter((b) => !pendingRemovals.has(b.id)) : rows;
      await this.loadProgress();
    },

    async loadProgress(): Promise<void> {
      const db = await getDb();
      const rows = await db.select<Progress[]>("SELECT * FROM progress");
      const map = new Map<number, Progress>();
      for (const row of rows) {
        map.set(row.book_id, row);
      }
      progressMap = map;
    },

    async loadChapters(bookId: number): Promise<Chapter[]> {
      if (chapters.has(bookId)) return chapters.get(bookId)!;
      const db = await getDb();
      const chs = await db.select<Chapter[]>(
        "SELECT * FROM chapters WHERE book_id = $1 ORDER BY chapter_index",
        [bookId],
      );
      chapters.set(bookId, chs);
      return chs;
    },

    importBooks(folderPath: string): Promise<void> {
      pendingImports++;
      const run = importQueue.then(() => this.scanAndImport(folderPath));
      run.catch((e) => logError(`Import of ${folderPath} failed`, e));
      importQueue = run.catch(() => {});
      return run.finally(() => {
        pendingImports--;
      });
    },

    /** Scan a folder and sync its books into the DB. Use importBooks() — it serialises calls. */
    async scanAndImport(folderPath: string): Promise<void> {
      const scanned: ScannedBook[] = await invoke("scan_folder", {
        path: folderPath,
      });
      const db = await getDb();
      const existing = await db.select<Book[]>("SELECT * FROM books");
      const chapterRows = await db.select<ChapterRow[]>(
        "SELECT book_id, chapter_index, title, file_path, duration_secs, start_offset_secs FROM chapters ORDER BY book_id, chapter_index",
      );
      const chaptersByBook = new Map<number, ChapterRow[]>();
      const bookByFile = new Map<string, number>();
      for (const row of chapterRows) {
        if (!chaptersByBook.has(row.book_id)) chaptersByBook.set(row.book_id, []);
        chaptersByBook.get(row.book_id)!.push(row);
        bookByFile.set(row.file_path, row.book_id);
      }

      // Match scanned books to existing ones so ids — and with them progress and
      // bookmarks — survive rescans, renames and moves. Strongest evidence first,
      // across all books, so a weak match can't steal a book a strong one owns.
      const matchFor = new Map<ScannedBook, number>();
      const taken = new Set<number>();
      const claim = (book: ScannedBook, id: number | undefined) => {
        if (id !== undefined && !taken.has(id) && !matchFor.has(book)) {
          matchFor.set(book, id);
          taken.add(id);
        }
      };
      // 1. Same audio file
      for (const book of scanned) claim(book, bookByFile.get(book.files[0]?.file_path ?? ""));
      // 2. Same folder, when only one unclaimed book lives there (files renamed)
      for (const book of scanned) {
        const inFolder = existing.filter((b) => b.folder_path === book.folder_path && !taken.has(b.id));
        if (inFolder.length === 1) claim(book, inFolder[0].id);
      }
      // 3. Same title and author (folder moved or renamed)
      for (const book of scanned) {
        claim(book, existing.find((b) => !taken.has(b.id) && b.title === book.title && b.author === book.author)?.id);
      }

      let changes = 0;
      const byId = new Map(existing.map((b) => [b.id, b]));
      for (const book of scanned) {
        const totalDuration = book.files.reduce((sum, f) => sum + f.duration_secs, 0);
        const id = matchFor.get(book);
        const genres = joinList(genresFromTag(book.genre));

        if (id === undefined) {
          const result = await db.execute(
            `INSERT INTO books (title, author, narrator, description, cover_art, folder_path, total_duration_secs, series, series_index, genres)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [book.title, book.author, book.narrator, book.description, book.cover_art, book.folder_path, totalDuration, book.series, book.series_index, joinList(genresFromTag(book.genre))],
          );
          await insertChapters(db, result.lastInsertId as number, book.files);
          changes++;
          continue;
        }

        const ex = byId.get(id)!;
        const oldChapters = chaptersByBook.get(id) ?? [];
        const chaptersChanged = !sameChapters(oldChapters, book.files);
        const fillsGap =
          (!ex.cover_art && !!book.cover_art) ||
          (!ex.narrator && !!book.narrator) ||
          (!ex.description && !!book.description) ||
          (!ex.series && !!book.series) ||
          (ex.series_index == null && book.series_index != null) ||
          (!ex.genres && !!genres) ||
          ((!ex.author || ex.author === "Unknown") && !!book.author && book.author !== "Unknown");
        const unchanged =
          !chaptersChanged &&
          !fillsGap &&
          ex.folder_path === book.folder_path &&
          Math.abs(ex.total_duration_secs - totalDuration) < 0.01;
        if (unchanged) continue;

        // Preserve user-edited fields: only fall back to scanned values when
        // the DB column is empty/null. Duration and location always come from the scan.
        await db.execute(
          `UPDATE books SET
             author              = CASE WHEN author IS NULL OR author = '' OR author = 'Unknown'
                                        THEN COALESCE(NULLIF($1, ''), author)
                                        ELSE author END,
             cover_art           = COALESCE(cover_art, $2),
             total_duration_secs = $3,
             narrator            = COALESCE(narrator, $4),
             description         = COALESCE(NULLIF(description, ''), NULLIF($5, '')),
             series              = COALESCE(NULLIF(series, ''), NULLIF($6, '')),
             series_index        = COALESCE(series_index, $7),
             folder_path         = $8,
             genres              = COALESCE(NULLIF(genres, ''), $10)
           WHERE id = $9`,
          [book.author, book.cover_art, totalDuration, book.narrator, book.description, book.series, book.series_index, book.folder_path, id, genres],
        );

        if (chaptersChanged) {
          await db.execute("DELETE FROM chapters WHERE book_id = $1", [id]);
          await insertChapters(db, id, book.files);
          // Chapter layout changed (e.g. embedded chapters now detected): move saved
          // positions so they still point at the same moment in the book.
          if (oldChapters.length > 0) {
            const [prog] = await db.select<{ chapter_index: number; position_secs: number }[]>(
              "SELECT chapter_index, position_secs FROM progress WHERE book_id = $1",
              [id],
            );
            if (prog) {
              const pos = remapPosition(oldChapters, book.files, prog.chapter_index, prog.position_secs);
              await db.execute("UPDATE progress SET chapter_index = $1, position_secs = $2 WHERE book_id = $3", [pos.chapterIndex, pos.positionSecs, id]);
            }
            const marks = await db.select<{ id: number; chapter_index: number; position_secs: number }[]>(
              "SELECT id, chapter_index, position_secs FROM bookmarks WHERE book_id = $1",
              [id],
            );
            for (const m of marks) {
              const pos = remapPosition(oldChapters, book.files, m.chapter_index, m.position_secs);
              await db.execute("UPDATE bookmarks SET chapter_index = $1, position_secs = $2 WHERE id = $3", [pos.chapterIndex, pos.positionSecs, m.id]);
            }
            if (marks.length > 0) bookmarksVersion++;
          }
          chapters.delete(id);
        }
        changes++;
      }

      // Remove books that used to live inside this folder but weren't found this time.
      // Done after matching so a moved book is updated rather than deleted and re-added.
      const idsToDelete = existing
        .filter((b) => isInsideFolder(b.folder_path, folderPath) && !taken.has(b.id))
        .map((b) => b.id);
      if (idsToDelete.length > 0) {
        await stopPlayerIfPlaying(idsToDelete);
        for (const id of idsToDelete) {
          await db.execute("DELETE FROM books WHERE id = $1", [id]);
        }
        changes += idsToDelete.length;
      }

      if (changes > 0) {
        chapters = new Map();
        await this.loadBooks();
      }
    },

    async deleteBook(bookId: number): Promise<void> {
      const db = await getDb();
      await db.execute("DELETE FROM books WHERE id = $1", [bookId]);
      chapters.delete(bookId);
      await this.loadBooks();
    },

    /** Remove a book from the library, with an Undo in the toast. */
    async removeBook(bookId: number): Promise<void> {
      const book = books.find((b) => b.id === bookId);
      if (!book || pendingRemovals.has(bookId)) return;
      await stopPlayerIfPlaying([bookId]);
      if (uiState.currentView === "book" && uiState.selectedBookId === bookId) uiState.navigateToLibrary();
      books = books.filter((b) => b.id !== bookId);

      const commit = () => {
        pendingRemovals.delete(bookId);
        this.deleteBook(bookId).catch(() => {});
      };
      pendingRemovals.set(bookId, setTimeout(commit, UNDO_MS));
      uiState.showToast(`Removed "${book.title}" from your library.`, {
        durationMs: UNDO_MS,
        action: {
          label: "Undo",
          run: () => {
            const timer = pendingRemovals.get(bookId);
            if (timer === undefined) return;
            clearTimeout(timer);
            pendingRemovals.delete(bookId);
            this.loadBooks().catch(() => {});
          },
        },
      });
    },

    async toggleFavourite(bookId: number): Promise<void> {
      const db = await getDb();
      const book = books.find((b) => b.id === bookId);
      if (!book) return;
      const newVal = (book as any).is_favourite ? 0 : 1;
      await db.execute("UPDATE books SET is_favourite = $1 WHERE id = $2", [newVal, bookId]);
      await this.loadBooks();
    },

    getBook(bookId: number): Book | undefined {
      return books.find((b) => b.id === bookId);
    },

    async updateBookMetadata(bookId: number, fields: { title?: string; author?: string; narrator?: string | null; cover_art?: string | null; description?: string | null; series?: string | null; series_index?: number | null; genres?: string | null; tags?: string | null }): Promise<void> {
      const db = await getDb();
      const sets: string[] = [];
      const vals: any[] = [];
      let idx = 1;
      if (fields.title !== undefined) { sets.push(`title = $${idx++}`); vals.push(fields.title); }
      if (fields.author !== undefined) { sets.push(`author = $${idx++}`); vals.push(fields.author); }
      if (fields.narrator !== undefined) { sets.push(`narrator = $${idx++}`); vals.push(fields.narrator); }
      if (fields.cover_art !== undefined) {
        // Never store image bytes in the DB — write them to the covers dir instead
        const cover = fields.cover_art?.startsWith("data:")
          ? await invoke<string>("save_cover_data_url", { dataUrl: fields.cover_art })
          : fields.cover_art;
        sets.push(`cover_art = $${idx++}`);
        vals.push(cover);
      }
      if (fields.description !== undefined) { sets.push(`description = $${idx++}`); vals.push(fields.description); }
      if (fields.series !== undefined) { sets.push(`series = $${idx++}`); vals.push(fields.series); }
      if (fields.series_index !== undefined) { sets.push(`series_index = $${idx++}`); vals.push(fields.series_index); }
      if (fields.genres !== undefined) { sets.push(`genres = $${idx++}`); vals.push(fields.genres); }
      if (fields.tags !== undefined) { sets.push(`tags = $${idx++}`); vals.push(fields.tags); }
      if (sets.length === 0) return;
      sets.push(`updated_at = datetime('now')`);
      vals.push(bookId);
      await db.execute(`UPDATE books SET ${sets.join(", ")} WHERE id = $${idx}`, vals);
      await this.loadBooks();
    },

    /** Clear a book's progress, with an Undo in the toast that puts the saved row back. */
    async clearProgress(bookId: number): Promise<void> {
      const db = await getDb();
      const [saved] = await db.select<Record<string, unknown>[]>("SELECT * FROM progress WHERE book_id = $1", [bookId]);
      await db.execute("DELETE FROM progress WHERE book_id = $1", [bookId]);
      await this.loadProgress();
      if (!saved) return;
      const title = books.find((b) => b.id === bookId)?.title ?? "this book";
      uiState.showToast(`Cleared progress for "${title}".`, {
        action: {
          label: "Undo",
          run: async () => {
            const columns = Object.keys(saved);
            await db.execute(
              `INSERT OR REPLACE INTO progress (${columns.join(", ")}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(", ")})`,
              columns.map((c) => saved[c]),
            );
            await this.loadProgress();
          },
        },
      });
    },

    async markAsFinished(bookId: number): Promise<void> {
      const book = books.find((b) => b.id === bookId);
      if (!book) return;
      const db = await getDb();
      await db.execute(
        `INSERT INTO progress (book_id, chapter_index, position_secs, playback_rate, book_position_secs, finished_at, updated_at)
         VALUES ($1, 0, 0, 1.0, $2, datetime('now'), datetime('now'))
         ON CONFLICT(book_id) DO UPDATE SET
           book_position_secs = $2,
           finished_at = datetime('now'),
           updated_at = datetime('now')`,
        [bookId, book.total_duration_secs],
      );
      await this.loadProgress();
    },

    // --- Bookmarks ---

    async loadBookmarks(bookId: number): Promise<Bookmark[]> {
      const db = await getDb();
      return db.select<Bookmark[]>(
        "SELECT * FROM bookmarks WHERE book_id = $1 ORDER BY chapter_index, position_secs",
        [bookId],
      );
    },

    async addBookmark(bookId: number, chapterIndex: number, positionSecs: number): Promise<void> {
      const db = await getDb();
      await db.execute(
        "INSERT INTO bookmarks (book_id, chapter_index, position_secs, label) VALUES ($1, $2, $3, NULL)",
        [bookId, chapterIndex, positionSecs],
      );
      bookmarksVersion++;
    },

    async updateBookmarkLabel(id: number, label: string): Promise<void> {
      const db = await getDb();
      await db.execute("UPDATE bookmarks SET label = $1 WHERE id = $2", [label.trim() || null, id]);
      bookmarksVersion++;
    },

    async deleteBookmark(id: number): Promise<void> {
      const db = await getDb();
      await db.execute("DELETE FROM bookmarks WHERE id = $1", [id]);
      bookmarksVersion++;
    },

    /**
     * Point a book at a new folder after its files were moved. The new folder must
     * contain the same files at the same relative paths. Returns true on success.
     */
    async relocateBook(bookId: number): Promise<boolean> {
      const book = books.find((b) => b.id === bookId);
      if (!book) return false;
      const selected = await open({ directory: true, multiple: false, title: `Locate "${book.title}"` });
      if (!selected) return false;
      const newRoot = trimSlashes(selected as string);
      const oldRoot = trimSlashes(book.folder_path);

      const db = await getDb();
      const chs = await db.select<Chapter[]>(
        "SELECT * FROM chapters WHERE book_id = $1 ORDER BY chapter_index",
        [bookId],
      );
      const newPaths = chs.map((c) =>
        isInsideFolder(c.file_path, oldRoot) ? newRoot + c.file_path.slice(oldRoot.length) : null,
      );
      const exists = newPaths.every((p) => p !== null)
        ? await invoke<boolean[]>("paths_exist", { paths: newPaths })
        : [];
      if (exists.length === 0 || !exists.every(Boolean)) {
        uiState.showToast(`That folder doesn't contain the files for "${book.title}".`, { kind: "error" });
        return false;
      }

      await invoke("allow_library_paths", { paths: [newRoot] });
      for (let i = 0; i < chs.length; i++) {
        await db.execute("UPDATE chapters SET file_path = $1 WHERE id = $2", [newPaths[i], chs[i].id]);
      }
      await db.execute("UPDATE books SET folder_path = $1 WHERE id = $2", [newRoot, bookId]);
      chapters.delete(bookId);
      await this.loadBooks();
      uiState.showToast(`Found "${book.title}".`, { kind: "success" });
      return true;
    },

    async setAudiobookFolder(path: string): Promise<void> {
      const previousFolder = audiobookFolder;
      audiobookFolder = path;
      localStorage.setItem("audia-audiobook-folder", path);
      await this.startWatching(path);
      if (path) {
        await this.importBooks(path);
      } else {
        // Folder cleared — remove books that came from the previous folder.
        const db = await getDb();
        const existing = await db.select<{ id: number; folder_path: string }[]>(
          "SELECT id, folder_path FROM books",
        );
        const idsToDelete = previousFolder
          ? existing.filter((b) => isInsideFolder(b.folder_path, previousFolder)).map((b) => b.id)
          : existing.map((b) => b.id);
        await stopPlayerIfPlaying(idsToDelete);
        for (const id of idsToDelete) {
          await db.execute("DELETE FROM books WHERE id = $1", [id]);
        }
        chapters = new Map();
        await this.loadBooks();
      }
    },

    /** Watch the library folder (in Rust) and rescan when it changes. Empty path stops watching. */
    async startWatching(path: string): Promise<void> {
      if (!watcherListening) {
        watcherListening = true;
        await listen<string>("library-changed", (event) => {
          if (copyInProgress || event.payload !== audiobookFolder) return;
          this.importBooks(event.payload).catch(() => {});
        });
      }
      try {
        await invoke("watch_library", { path });
      } catch (e) {
        logWarn(`Couldn't watch the library folder ${path}`, e);
      }
    },

    async initWatchFolder(): Promise<void> {
      if (audiobookFolder) {
        await this.startWatching(audiobookFolder);
        await this.importBooks(audiobookFolder);
      }
    },

    /** Set while drag-and-drop copies into the library, to pause watcher rescans. */
    set copyInProgress(v: boolean) {
      copyInProgress = v;
    },
  };
}

export const libraryState = createLibraryState();
