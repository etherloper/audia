<script lang="ts" module>
  // Lets other components (e.g. the sidebar's search button) open the palette. A direct
  // call rather than a reactive flag, so a remount (e.g. leaving the mini player) can't
  // replay an old request.
  let showPalette: (() => void) | null = null;
  export function openQuickSearch() {
    showPalette?.();
  }
</script>

<script lang="ts">
  import { onMount, tick } from "svelte";
  import { libraryState } from "../../state/library.svelte";
  import { playerState } from "../../state/player.svelte";
  import { uiState } from "../../state/ui.svelte";
  import { getDb } from "../../utils/db";
  import { coverSrc } from "../../utils/covers";
  import { formatDuration } from "../../utils/format";
  import { quickSearch, type NoteRef, type QuickResult } from "../../utils/quickSearch";

  let open = $state(false);
  let query = $state("");
  let selected = $state(0);
  let notes = $state<NoteRef[]>([]);
  let inputEl: HTMLInputElement | undefined = $state();
  let listEl: HTMLDivElement | undefined = $state();

  let results = $derived(quickSearch(query, libraryState.books, notes));

  const SECTION_LABELS: Record<QuickResult["kind"], string> = {
    book: "Books",
    author: "Authors",
    series: "Series",
    genre: "Genres",
    tag: "Tags",
    note: "Bookmark notes",
  };

  async function show() {
    open = true;
    query = "";
    selected = 0;
    await tick();
    inputEl?.focus();
    // Notes are only needed while searching, so load them on open
    const db = await getDb();
    notes = await db.select<NoteRef[]>(
      `SELECT bm.id, bm.book_id, b.title AS book_title, bm.chapter_index, bm.position_secs, bm.label
       FROM bookmarks bm JOIN books b ON b.id = bm.book_id
       WHERE bm.label IS NOT NULL AND bm.label != ''`,
    );
  }

  function close() {
    open = false;
  }

  onMount(() => {
    showPalette = show;
    return () => {
      if (showPalette === show) showPalette = null;
    };
  });

  // Reset the highlight as results change
  $effect(() => {
    results;
    selected = 0;
  });

  onMount(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.code === "KeyK") {
        e.preventDefault();
        if (open) close();
        else show();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function run(result: QuickResult, play = false) {
    close();
    switch (result.kind) {
      case "book":
        if (play) playerState.openBook(result.book.id);
        else uiState.navigateToBook(result.book.id);
        break;
      case "author":
      case "series":
        libraryState.filterBy = "all";
        libraryState.groupBy = result.kind === "series" ? "series" : "none";
        libraryState.sortBy = "title";
        libraryState.searchQuery = result.name;
        libraryState.tagFilter = null;
        uiState.navigateToLibrary();
        break;
      case "genre":
      case "tag":
        libraryState.filterBy = "all";
        libraryState.searchQuery = "";
        libraryState.tagFilter = { kind: result.kind, name: result.name };
        uiState.navigateToLibrary();
        break;
      case "note":
        playerState.openBook(result.note.book_id, {
          chapterIndex: result.note.chapter_index,
          positionSecs: result.note.position_secs,
        });
        break;
    }
  }

  async function onInputKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (results.length === 0) return;
      selected = (selected + (e.key === "ArrowDown" ? 1 : -1) + results.length) % results.length;
      await tick();
      listEl?.querySelector(`[data-index="${selected}"]`)?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter" && results[selected]) {
      e.preventDefault();
      run(results[selected], e.ctrlKey || e.metaKey);
    }
  }

  let pressedOnBackdrop = false;
</script>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[12vh] animate-fadeIn"
    onmousedown={(e) => (pressedOnBackdrop = e.target === e.currentTarget)}
    onclick={(e) => {
      if (pressedOnBackdrop && e.target === e.currentTarget) close();
      pressedOnBackdrop = false;
    }}
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Quick search"
      class="animate-scaleIn mx-4 flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-warm-200 bg-warm-50 shadow-2xl shadow-black/20 dark:border-neutral-800 dark:bg-neutral-900 dark:shadow-black/60"
    >
      <div class="flex items-center gap-3 border-b border-warm-200 px-4 dark:border-neutral-800">
        <svg class="h-4 w-4 shrink-0 text-warm-400 dark:text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z" />
        </svg>
        <input
          bind:this={inputEl}
          bind:value={query}
          onkeydown={onInputKey}
          placeholder="Search books, authors, series, genres, tags and notes…"
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls="quick-search-results"
          aria-activedescendant={results.length > 0 ? `quick-result-${selected}` : undefined}
          aria-autocomplete="list"
          class="h-12 min-w-0 flex-1 bg-transparent text-[14px] text-warm-900 outline-none placeholder:text-warm-400 dark:text-neutral-100 dark:placeholder:text-neutral-500"
        />
        <kbd class="shrink-0 rounded border border-warm-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-warm-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">Esc</kbd>
      </div>

      <div id="quick-search-results" role="listbox" aria-label="Results" class="min-h-0 flex-1 overflow-y-auto py-1.5" bind:this={listEl}>
        {#if query.trim() && results.length === 0}
          <p class="px-4 py-6 text-center text-[13px] text-warm-500 dark:text-neutral-400">No matches for “{query.trim()}”</p>
        {:else if !query.trim()}
          <p class="px-4 py-6 text-center text-[13px] text-warm-500 dark:text-neutral-400">Type to search your library</p>
        {/if}

        {#each results as result, i}
          {#if i === 0 || results[i - 1].kind !== result.kind}
            <p class="px-4 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-warm-400 dark:text-neutral-500">
              {SECTION_LABELS[result.kind]}
            </p>
          {/if}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div
            id="quick-result-{i}"
            data-index={i}
            role="option"
            tabindex="-1"
            aria-selected={i === selected}
            onmousemove={() => (selected = i)}
            onclick={(e) => run(result, e.ctrlKey || e.metaKey)}
            class="mx-1.5 flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 {i === selected ? 'bg-warm-200/70 dark:bg-white/[0.08]' : ''}"
          >
            {#if result.kind === "book"}
              <div class="h-9 w-9 shrink-0 overflow-hidden rounded bg-warm-200 dark:bg-neutral-800">
                {#if result.book.cover_art}
                  <img src={coverSrc(result.book.cover_art)} alt="" class="h-full w-full object-cover" />
                {/if}
              </div>
              <div class="min-w-0 flex-1">
                <p class="truncate text-[13px] font-medium text-warm-900 dark:text-neutral-100">{result.book.title}</p>
                <p class="truncate text-[11.5px] text-warm-500 dark:text-neutral-400">
                  {result.book.author}{#if result.match === "series" && result.book.series} · {result.book.series}{:else if result.match === "narrator" && result.book.narrator} · read by {result.book.narrator}{/if}
                </p>
              </div>
              {#if i === selected}
                <span class="shrink-0 text-[10.5px] text-warm-400 dark:text-neutral-500">Enter to open · Ctrl+Enter to play</span>
              {/if}
            {:else if result.kind === "note"}
              <svg class="h-4 w-4 shrink-0 text-warm-400 dark:text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
              <div class="min-w-0 flex-1">
                <p class="truncate text-[13px] text-warm-900 dark:text-neutral-100">{result.note.label}</p>
                <p class="truncate text-[11.5px] text-warm-500 dark:text-neutral-400">
                  {result.note.book_title} · Ch {result.note.chapter_index + 1} · {formatDuration(result.note.position_secs)}
                </p>
              </div>
              {#if i === selected}
                <span class="shrink-0 text-[10.5px] text-warm-400 dark:text-neutral-500">Enter to play from here</span>
              {/if}
            {:else}
              <svg class="h-4 w-4 shrink-0 text-warm-400 dark:text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                {#if result.kind === "author"}
                  <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                {:else if result.kind === "genre" || result.kind === "tag"}
                  <path stroke-linecap="round" stroke-linejoin="round" d="M7 7h.01M7 3h5a1.99 1.99 0 011.41.59l7 7a2 2 0 010 2.82l-7 7a2 2 0 01-2.82 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
                {:else}
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                {/if}
              </svg>
              <p class="min-w-0 flex-1 truncate text-[13px] text-warm-900 dark:text-neutral-100">{result.kind === "tag" ? "#" : ""}{result.name}</p>
              <span class="shrink-0 text-[11px] tabular-nums text-warm-400 dark:text-neutral-500">
                {result.count} {result.count === 1 ? "book" : "books"}
              </span>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  </div>
{/if}
