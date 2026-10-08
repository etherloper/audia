<script lang="ts">
  import { descriptionParagraphs } from "../../utils/description";
  import { libraryState } from "../../state/library.svelte";
  import { playerState } from "../../state/player.svelte";
  import { uiState } from "../../state/ui.svelte";
  import { formatDuration, formatDurationShort, formatTimeLeft } from "../../utils/format";
  import { coverSrc } from "../../utils/covers";
  import type { Bookmark, Chapter } from "../../types";
  import ChapterList from "./ChapterList.svelte";
  import EditMetadataModal from "../shared/EditMetadataModal.svelte";
  import ContextMenu from "../shared/ContextMenu.svelte";
  import { bookMenuItems } from "../../utils/bookMenu";
  import { parseList } from "../../utils/tags";
  import { invoke } from "@tauri-apps/api/core";
  import { bookmarksToMarkdown, exportFileName } from "../../utils/bookmarkExport";
  import { logError } from "../../utils/log";

  let chapters = $state<Chapter[]>([]);
  let bookmarks = $state<Bookmark[]>([]);
  let activeTab = $state<"chapters" | "bookmarks">("chapters");
  let descriptionExpanded = $state(false);
  let descriptionTruncated = $state(false);
  let descriptionEl: HTMLDivElement | undefined = $state();
  let narratorExpanded = $state(false);
  let showEditMetadata = $state(false);
  let moreMenu = $state<{ x: number; y: number } | null>(null);

  /** Open the library showing every book with this genre or tag. */
  function showAllWith(kind: "genre" | "tag", name: string) {
    libraryState.searchQuery = "";
    libraryState.filterBy = "all";
    libraryState.tagFilter = { kind, name };
    uiState.navigateToLibrary();
  }

  function toggleMoreMenu(e: MouseEvent) {
    if (moreMenu) {
      moreMenu = null;
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    moreMenu = { x: rect.left, y: rect.bottom + 6 };
  }

  let book = $derived(
    uiState.selectedBookId !== null
      ? libraryState.getBook(uiState.selectedBookId)
      : null,
  );

  let genreList = $derived(parseList(book?.genres));
  let tagList = $derived(parseList(book?.tags));

  let isCurrentBook = $derived(
    playerState.currentBookId === uiState.selectedBookId,
  );

  let progress = $derived(
    uiState.selectedBookId !== null
      ? libraryState.progressMap.get(uiState.selectedBookId) ?? null
      : null,
  );

  let isFinished = $derived(!!progress?.finished_at);

  // For the book that's playing, use live player values — saved progress lags by up to 5s
  let overallProgressPct = $derived.by(() => {
    if (isCurrentBook && !isFinished) return playerState.overallProgressPercent;
    return book && progress ? libraryState.progressFraction(book) * 100 : 0;
  });

  let timeRemaining = $derived.by(() => {
    if (!book || isFinished) return 0;
    if (isCurrentBook) return playerState.bookRemainingSecs;
    return Math.max(0, book.total_duration_secs - (progress?.book_position_secs ?? 0));
  });

  // Speed this book plays at: live if it's loaded, otherwise its saved speed
  let bookRate = $derived(isCurrentBook ? playerState.playbackRate : (progress?.playback_rate ?? 1));

  // Bookmark note editing
  let editingBookmarkId = $state<number | null>(null);
  let editingLabel = $state("");

  function startEditingBookmark(bm: Bookmark) {
    editingBookmarkId = bm.id;
    editingLabel = bm.label ?? "";
  }

  async function saveBookmarkLabel() {
    if (editingBookmarkId === null) return;
    const id = editingBookmarkId;
    editingBookmarkId = null;
    await libraryState.updateBookmarkLabel(id, editingLabel);
  }

  function focusOnMount(el: HTMLInputElement) {
    el.focus();
    el.select();
  }

  // Parse narrator list for "& x more" display
  let narratorList = $derived.by(() => {
    if (!book?.narrator) return [];
    // Split on common delimiters: comma, semicolon, " & ", " and "
    return book.narrator.split(/[,;]|\s+&\s+|\s+and\s+/i).map(n => n.trim()).filter(n => n.length > 0);
  });

  let visibleNarrators = $derived(narratorList.slice(0, 4));
  let hiddenNarratorCount = $derived(Math.max(0, narratorList.length - 4));

  $effect(() => {
    if (uiState.selectedBookId !== null) {
      descriptionExpanded = false;
      descriptionTruncated = false;
      narratorExpanded = false;
      editingBookmarkId = null;
      loadData(uiState.selectedBookId);
    }
  });

  // Reload when a bookmark is added from the player bar or edited elsewhere
  $effect(() => {
    libraryState.bookmarksVersion;
    const id = uiState.selectedBookId;
    if (id !== null) libraryState.loadBookmarks(id).then((b) => (bookmarks = b));
  });

  $effect(() => {
    if (descriptionEl && !descriptionExpanded) {
      // Check if the text is actually clamped
      descriptionTruncated = descriptionEl.scrollHeight > descriptionEl.clientHeight;
    }
  });

  async function loadData(bookId: number) {
    chapters = await libraryState.loadChapters(bookId);
  }

  let exporting = $state(false);

  async function exportBookmarks() {
    if (!book) return;
    exporting = true;
    try {
      const markdown = bookmarksToMarkdown(book, chapters, bookmarks, new Date());
      const path = await invoke<string | null>("save_markdown_file", {
        contents: markdown,
        defaultName: exportFileName(book.title),
      });
      if (path) uiState.showToast(`Bookmarks exported to ${path}`, { durationMs: 8000, kind: "success" });
    } catch (e) {
      logError("Bookmark export failed", e);
      uiState.showToast(`Export failed: ${e instanceof Error ? e.message : e}`, { kind: "error" });
    } finally {
      exporting = false;
    }
  }

  function playBookmark(bm: Bookmark) {
    playerState.openBook(bm.book_id, { chapterIndex: bm.chapter_index, positionSecs: bm.position_secs });
  }

  let isPlayingThisBook = $derived(isCurrentBook && playerState.isPlaying);

  function playBook() {
    if (isCurrentBook) {
      playerState.togglePlayPause();
    } else if (uiState.selectedBookId !== null) {
      playerState.openBook(uiState.selectedBookId);
    }
  }
</script>

{#if book}
  <div class="flex h-full flex-col overflow-y-auto">
    <!-- Hero Header with blurred cover background -->
    <div class="relative overflow-hidden">
      <!-- Blurred cover art background -->
      {#if book.cover_art}
        <div class="absolute inset-0 -inset-x-8 -top-8">
          <img
            src={coverSrc(book.cover_art)}
            alt=""
            class="h-full w-full object-cover scale-110"
            style="filter: blur(40px) saturate(140%) brightness(0.9);"
          />
          <div class="absolute inset-0 bg-canvas/75"></div>
          <div class="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-canvas"></div>
        </div>
      {:else}
        <div class="absolute inset-0 bg-gradient-to-b from-warm-200/30 to-transparent dark:from-neutral-800/30"></div>
      {/if}
      <div class="relative flex gap-6 px-6 pt-8 pb-6">
        <div class="h-48 w-48 shrink-0 overflow-hidden rounded-xl shadow-2xl shadow-black/20 dark:shadow-black/40">
          {#if book.cover_art}
            <img src={coverSrc(book.cover_art)} alt={book.title} class="h-full w-full object-cover" />
          {:else}
            <div class="flex h-full w-full items-center justify-center bg-gradient-to-br from-warm-200 to-warm-300 dark:from-neutral-800 dark:to-neutral-900">
              <svg class="h-16 w-16 text-warm-400/60 dark:text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="0.8">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
          {/if}
        </div>

        <div class="flex min-w-0 flex-col justify-end gap-1.5" style="text-shadow: 0 1px 3px rgba(0,0,0,0.08);">
          <p class="text-[11px] font-semibold uppercase tracking-wider text-warm-600 dark:text-neutral-300/90">Audiobook</p>
          <h1 class="text-2xl font-bold tracking-tight leading-tight text-warm-900 dark:text-white">{book.title}</h1>
          <p class="text-[15px] text-warm-700 dark:text-neutral-300">{book.author}</p>
          {#if narratorList.length > 0}
            <p class="text-[13px] text-warm-600 dark:text-neutral-400">
              Narrated by {#if narratorList.length <= 4}
                {narratorList.join(", ")}
              {:else}
                {narratorExpanded ? narratorList.join(", ") : visibleNarrators.join(", ")}
                <button
                  onclick={() => (narratorExpanded = !narratorExpanded)}
                  class="ml-1 font-medium text-warm-600 transition-colors hover:text-warm-800 dark:text-neutral-400 dark:hover:text-neutral-200"
                >
                  {narratorExpanded ? "show less" : `& ${hiddenNarratorCount} more`}
                </button>
              {/if}
            </p>
          {/if}
          <p class="text-[13px] text-warm-600 dark:text-neutral-400">
            {chapters.length} {chapters.length === 1 ? "chapter" : "chapters"} &middot; {formatDurationShort(book.total_duration_secs)}
          </p>

          {#if genreList.length || tagList.length}
            <div class="mt-2 flex flex-wrap gap-1.5">
              {#each genreList as genre}
                <button
                  onclick={() => showAllWith("genre", genre)}
                  class="rounded-full bg-warm-200/60 px-2.5 py-0.5 text-[11.5px] font-medium text-warm-700 transition-colors hover:bg-warm-300/60 hover:text-warm-900 dark:bg-white/[0.07] dark:text-neutral-300 dark:hover:bg-white/[0.12] dark:hover:text-white"
                  title="All {genre} books"
                >
                  {genre}
                </button>
              {/each}
              {#each tagList as tag}
                <button
                  onclick={() => showAllWith("tag", tag)}
                  class="rounded-full border border-accent-500/40 px-2.5 py-0.5 text-[11.5px] font-medium text-accent-600 transition-colors hover:bg-accent-500/10 dark:text-accent-400"
                  title="All books tagged {tag}"
                >
                  #{tag}
                </button>
              {/each}
            </div>
          {/if}

          <!-- Play/Resume button + progress -->
          <div class="mt-3 flex items-center gap-3">
            <button
              onclick={playBook}
              class="btn-primary inline-flex items-center gap-2 rounded-full py-2.5 pl-5 pr-6 text-[13px] font-bold hover:scale-[1.03] active:scale-[0.97]"
            >
              {#if isPlayingThisBook}
                <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                </svg>
                Pause
              {:else}
                <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                {isCurrentBook ? "Resume" : "Play"}
              {/if}
            </button>
            <button
              onclick={() => (showEditMetadata = true)}
              class="btn-secondary inline-flex items-center gap-1.5 rounded-full border py-2 pl-3.5 pr-4 text-[13px] font-medium text-warm-700 dark:text-neutral-300"
              title="Edit title, author, cover and description, or find them online"
            >
              <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
              Edit details
            </button>
            <!-- Stopping mousedown keeps the menu's click-outside handler from closing it before the toggle runs -->
            <button
              onmousedown={(e) => e.stopPropagation()}
              onclick={toggleMoreMenu}
              aria-haspopup="menu"
              aria-expanded={moreMenu !== null}
              class="btn-secondary flex h-9 w-9 items-center justify-center rounded-full border text-warm-700 dark:text-neutral-300"
              title="More actions"
              aria-label="More actions"
            >
              <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.9" /><circle cx="12" cy="12" r="1.9" /><circle cx="19" cy="12" r="1.9" /></svg>
            </button>
            {#if progress || isCurrentBook}
              <div class="flex items-center gap-2.5">
                <div class="w-40">
                  <div class="h-1.5 w-full overflow-hidden rounded-full bg-warm-200/50 dark:bg-white/[0.06]">
                    <div
                      class="h-full rounded-full bg-accent-500 transition-all duration-500"
                      style="width: {overallProgressPct}%;"
                    ></div>
                  </div>
                </div>
                <span class="text-[11px] tabular-nums font-medium text-warm-500 dark:text-neutral-500 whitespace-nowrap">
                  {#if isFinished}
                    Finished
                  {:else}
                    {Math.round(overallProgressPct)}% &middot; {formatTimeLeft(timeRemaining)} left
                    {#if bookRate !== 1}
                      <span class="text-warm-400 dark:text-neutral-600">({formatTimeLeft(timeRemaining / bookRate)} at {bookRate}×)</span>
                    {/if}
                  {/if}
                </span>
              </div>
            {/if}
          </div>
        </div>
      </div>
    </div>

    <!-- Description section — click to expand/collapse only when truncated -->
    {#if book.description}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="mx-6 mb-4 rounded-xl border border-warm-200/40 bg-warm-100/30 px-4 py-3 transition-colors dark:border-white/[0.04] dark:bg-white/[0.02] {descriptionTruncated || descriptionExpanded ? 'cursor-pointer hover:bg-warm-100/50 dark:hover:bg-white/[0.04]' : ''}"
        onclick={descriptionTruncated || descriptionExpanded ? () => (descriptionExpanded = !descriptionExpanded) : undefined}
      >
        <p class="text-[11px] font-semibold uppercase tracking-wider text-warm-400 dark:text-neutral-500 mb-1.5">Summary</p>
        <!-- Each line break in the description starts a new paragraph -->
        <div bind:this={descriptionEl} class="space-y-2 text-[12.5px] leading-relaxed text-warm-600/90 dark:text-neutral-400/90 {descriptionExpanded ? '' : 'line-clamp-3'}">
          {#each descriptionParagraphs(book.description) as paragraph}
            <p>{paragraph}</p>
          {/each}
        </div>
        {#if descriptionTruncated || descriptionExpanded}
          <p class="mt-1.5 text-[11px] font-medium text-warm-400 dark:text-neutral-500">
            {descriptionExpanded ? "Show less" : "Show more"}
          </p>
        {/if}
      </div>
    {/if}

    <!-- Tabs -->
    <div class="flex gap-5 border-b border-warm-200/80 px-6 dark:border-white/[0.10]">
      <button
        onclick={() => (activeTab = "chapters")}
        class="relative pb-2.5 text-[13px] font-semibold transition-colors {activeTab === 'chapters' ? 'text-warm-800 dark:text-white' : 'text-warm-400 hover:text-warm-600 dark:text-neutral-400 dark:hover:text-neutral-300'}"
      >
        Chapters
        {#if activeTab === "chapters"}
          <div class="absolute bottom-0 left-0 right-0 h-[2px] bg-warm-800 dark:bg-white"></div>
        {/if}
      </button>
      <button
        onclick={() => (activeTab = "bookmarks")}
        class="relative pb-2.5 text-[13px] font-semibold transition-colors {activeTab === 'bookmarks' ? 'text-warm-800 dark:text-white' : 'text-warm-400 hover:text-warm-600 dark:text-neutral-400 dark:hover:text-neutral-300'}"
      >
        Bookmarks
        {#if bookmarks.length > 0}
          <span class="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-warm-200/80 px-1 text-[10px] font-bold dark:bg-white/10">
            {bookmarks.length}
          </span>
        {/if}
        {#if activeTab === "bookmarks"}
          <div class="absolute bottom-0 left-0 right-0 h-[2px] bg-warm-800 dark:bg-white"></div>
        {/if}
      </button>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto px-5 py-3">
      {#if activeTab === "chapters"}
        <ChapterList {chapters} />
      {:else}
        {#if bookmarks.length === 0}
          <div class="flex flex-col items-center justify-center gap-3 py-12 text-warm-500 dark:text-neutral-500">
            <svg class="h-8 w-8 text-warm-300 dark:text-neutral-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            <p class="text-[13px]">No bookmarks yet.</p>
          </div>
        {:else}
          <div class="mb-1 flex items-center justify-between px-3">
            <p class="text-[11px] text-warm-400 dark:text-neutral-500">
              {bookmarks.length} {bookmarks.length === 1 ? "bookmark" : "bookmarks"}
            </p>
            <button
              onclick={exportBookmarks}
              disabled={exporting}
              class="flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-medium text-warm-500 transition-colors hover:bg-warm-100 hover:text-warm-800 disabled:opacity-50 dark:text-neutral-400 dark:hover:bg-neutral-900 dark:hover:text-white"
              title="Save these bookmarks and notes as a Markdown file"
            >
              <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16" />
              </svg>
              {exporting ? "Exporting…" : "Export"}
            </button>
          </div>
          <div class="space-y-0.5">
            {#each bookmarks as bm (bm.id)}
              <div class="group flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-colors hover:bg-warm-100 dark:hover:bg-neutral-900">
                <button
                  onclick={() => playBookmark(bm)}
                  class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-warm-400 transition-colors hover:bg-accent-500 hover:text-accent-fg dark:text-neutral-400"
                  title="Play from here"
                >
                  <svg class="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </button>
                <div class="min-w-0 flex-1">
                  <p class="truncate text-[12px] text-warm-500 dark:text-neutral-400">
                    <span class="font-medium tabular-nums text-warm-800 dark:text-neutral-200">Ch {bm.chapter_index + 1} &middot; {formatDuration(bm.position_secs)}</span>
                    {#if chapters[bm.chapter_index]}
                      <span class="ml-1.5">{chapters[bm.chapter_index].title}</span>
                    {/if}
                  </p>
                  {#if editingBookmarkId === bm.id}
                    <input
                      use:focusOnMount
                      bind:value={editingLabel}
                      onkeydown={(e) => {
                        if (e.key === "Enter") saveBookmarkLabel();
                        else if (e.key === "Escape") editingBookmarkId = null;
                      }}
                      onblur={saveBookmarkLabel}
                      placeholder="Add a note…"
                      class="mt-1 w-full rounded-md border border-warm-200/70 bg-white/60 px-2 py-1 text-[12.5px] outline-none focus:border-warm-400/80 dark:border-white/[0.08] dark:bg-white/[0.04] dark:focus:border-white/15"
                    />
                  {:else if bm.label}
                    <button onclick={() => startEditingBookmark(bm)} class="mt-0.5 block max-w-full truncate text-left text-[12.5px]" title="Edit note">
                      {bm.label}
                    </button>
                  {/if}
                </div>
                {#if editingBookmarkId !== bm.id}
                  <button
                    onclick={() => startEditingBookmark(bm)}
                    class="rounded p-1 text-warm-400 opacity-0 transition-all hover:bg-warm-200/60 hover:text-warm-800 group-hover:opacity-100 focus:opacity-100 dark:text-neutral-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
                    title={bm.label ? "Edit note" : "Add note"}
                  >
                    <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.232-6.232a2.5 2.5 0 113.536 3.536L12.536 16.536 8 18l1.464-4.536z" />
                    </svg>
                  </button>
                {/if}
                <button
                  onclick={() => libraryState.deleteBookmark(bm.id)}
                  class="rounded p-1 text-warm-400 opacity-0 transition-all hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100 focus:opacity-100 dark:text-neutral-400"
                  title="Delete bookmark"
                >
                  <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            {/each}
          </div>
        {/if}
      {/if}
    </div>
  </div>

  {#if showEditMetadata}
    <EditMetadataModal {book} onclose={() => (showEditMetadata = false)} />
  {/if}
  {#if moreMenu}
    <ContextMenu
      x={moreMenu.x}
      y={moreMenu.y}
      items={bookMenuItems(book, { onEdit: () => (showEditMetadata = true), onBookPage: true })}
      onclose={() => (moreMenu = null)}
    />
  {/if}
{/if}
