<script lang="ts" module>
  /**
   * Where the library was scrolled to. Kept outside the component, which is
   * unmounted while a book's page is open, so coming back lands in the same place.
   * The position is remembered as "this book, this far from the top" rather than a
   * pixel offset: off-screen cards are only estimated in size until drawn, so a raw
   * scrollTop wouldn't land on the same books.
   */
  const memory = { key: "", limit: 0, anchorId: null as number | null, anchorOffset: 0 };
</script>

<script lang="ts">
  import { libraryState } from "../../state/library.svelte";
  import { uiState } from "../../state/ui.svelte";
  import { onMount, tick } from "svelte";
  import BookCard from "./BookCard.svelte";
  import BookRow, { ROW_COLUMNS } from "./BookRow.svelte";
  import Dropdown from "../shared/Dropdown.svelte";
  import DropdownItem from "../shared/DropdownItem.svelte";
  import { SORT_LABELS } from "../../utils/librarySort";
  import type { SortOption } from "../../types";


  const filterOptions = [
    { value: "all" as const, label: "All" },
    { value: "in-progress" as const, label: "In Progress" },
    { value: "not-started" as const, label: "Not Started" },
    { value: "finished" as const, label: "Finished" },
    { value: "favourites" as const, label: "Favourites" },
  ];

  const sortOptions = (["title", "author", "recent", "added", "length", "progress"] as SortOption[]).map((value) => ({
    value,
    label: SORT_LABELS[value],
  }));

  const groupOptions = [
    { value: "none" as const, label: "No Grouping" },
    { value: "author" as const, label: "By Author" },
    { value: "series" as const, label: "By Series" },
    { value: "genre" as const, label: "By Genre" },
  ];

  const groupLabels: Record<string, string> = { none: "Group", author: "Author", series: "Series", genre: "Genre" };

  // Render progressively: big libraries would otherwise create every card up front,
  // which makes sorting, grouping and searching stutter. More load as you scroll.
  const PAGE_SIZE = 60;
  let limit = $state(Math.max(PAGE_SIZE, memory.limit));
  let scrollEl: HTMLDivElement | undefined = $state();

  let viewKey = $derived(
    JSON.stringify([libraryState.filterBy, libraryState.sortBy, libraryState.groupBy, libraryState.searchQuery, libraryState.viewMode, libraryState.tagFilter]),
  );

  // Start again from the top when what's shown changes — but not when books merely
  // reload (e.g. after favouriting), nor when coming back to the same view.
  $effect(() => {
    const key = viewKey;
    if (key === memory.key) return;
    memory.key = key;
    memory.anchorId = null;
    limit = PAGE_SIZE;
    scrollEl?.scrollTo({ top: 0 });
  });

  $effect(() => {
    memory.limit = limit;
  });

  /** Note the first book at least partly in view, and how far it sits from the top. */
  function rememberPosition() {
    if (!scrollEl) return;
    if (scrollEl.scrollTop < 4) {
      memory.anchorId = null;
      return;
    }
    const top = scrollEl.getBoundingClientRect().top;
    for (const el of scrollEl.querySelectorAll<HTMLElement>("[data-book-id]")) {
      const rect = el.getBoundingClientRect();
      if (rect.bottom > top) {
        memory.anchorId = Number(el.dataset.bookId);
        memory.anchorOffset = rect.top - top;
        return;
      }
    }
  }

  let rememberTimer: ReturnType<typeof setTimeout> | null = null;
  function onScroll() {
    maybeLoadMore();
    if (rememberTimer) clearTimeout(rememberTimer);
    rememberTimer = setTimeout(rememberPosition, 120);
  }

  onMount(() => {
    // Back from a book's page: put the remembered book where it was
    if (memory.anchorId !== null && memory.key === viewKey) {
      const id = memory.anchorId;
      tick().then(() => {
        const el = scrollEl?.querySelector<HTMLElement>(`[data-book-id="${id}"]`);
        if (scrollEl && el) {
          scrollEl.scrollTop += el.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top - memory.anchorOffset;
        }
      });
    }
    return () => {
      if (rememberTimer) clearTimeout(rememberTimer);
    };
  });

  // List view column headers that sort
  const sortableColumns: { label: string; sort: SortOption; align?: string }[] = [
    { label: "Title", sort: "title" },
    { label: "Author", sort: "author" },
    { label: "Length", sort: "length", align: "text-right" },
    { label: "Progress", sort: "progress" },
    { label: "Added", sort: "added" },
  ];

  let totalBooks = $derived(libraryState.groupedBooks.reduce((n, g) => n + g.books.length, 0));

  /** Groups trimmed to the first `limit` books overall. */
  let visibleGroups = $derived.by(() => {
    let remaining = limit;
    const out = [];
    for (const group of libraryState.groupedBooks) {
      if (remaining <= 0) break;
      out.push({ ...group, books: group.books.slice(0, remaining) });
      remaining -= group.books.length;
    }
    return out;
  });

  /** Load the next page once you're within 800px of the bottom. */
  function maybeLoadMore() {
    if (!scrollEl || limit >= totalBooks) return;
    const { scrollTop, clientHeight, scrollHeight } = scrollEl;
    if (scrollTop + clientHeight >= scrollHeight - 800) limit += PAGE_SIZE;
  }

  // After each render, keep loading until the visible area is filled (tall windows)
  $effect(() => {
    visibleGroups;
    tick().then(maybeLoadMore);
  });
</script>

<div class="flex h-full flex-col relative">
  <div class="flex items-center justify-between px-6 pt-5 pb-2">
    <div>
      <h1 class="text-xl font-bold tracking-tight">Library</h1>
      {#if libraryState.books.length > 0}
        <p class="mt-0.5 text-[13px] text-warm-500 dark:text-neutral-500">
          {libraryState.filteredBooks.length} of {libraryState.books.length} books
          {#if libraryState.isImporting}
            <span class="ml-1 text-warm-400 dark:text-neutral-600">· Scanning...</span>
          {/if}
        </p>
      {/if}
      <!-- Genre / tag filter; shown so it can be seen and cleared -->
      {#if libraryState.tagFilter}
        {@const tf = libraryState.tagFilter}
        <div class="mt-2 mr-1.5 inline-flex items-center gap-1.5 rounded-full border border-warm-200 bg-white py-0.5 pl-2.5 pr-1 text-[12px] dark:border-neutral-700 dark:bg-neutral-900">
          <span class="text-warm-500 dark:text-neutral-400">{tf.kind === "genre" ? "Genre:" : "Tag:"}</span>
          <span class="max-w-[260px] truncate font-medium text-warm-800 dark:text-neutral-100">{tf.kind === "tag" ? "#" : ""}{tf.name}</span>
          <button
            onclick={() => (libraryState.tagFilter = null)}
            class="flex h-5 w-5 items-center justify-center rounded-full text-warm-400 transition-colors hover:bg-warm-100 hover:text-warm-800 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-white"
            aria-label="Clear genre or tag filter"
            title="Clear filter"
          >
            <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" d="M6 6l12 12M6 18L18 6" />
            </svg>
          </button>
        </div>
      {/if}
      <!-- Text filter set from quick search (author/series picks); shown so it can be seen and cleared -->
      {#if libraryState.searchQuery.trim()}
        <div class="mt-2 inline-flex items-center gap-1.5 rounded-full border border-warm-200 bg-white py-0.5 pl-2.5 pr-1 text-[12px] dark:border-neutral-700 dark:bg-neutral-900">
          <span class="text-warm-500 dark:text-neutral-400">Showing:</span>
          <span class="max-w-[260px] truncate font-medium text-warm-800 dark:text-neutral-100">{libraryState.searchQuery}</span>
          <button
            onclick={() => (libraryState.searchQuery = "")}
            class="flex h-5 w-5 items-center justify-center rounded-full text-warm-400 transition-colors hover:bg-warm-100 hover:text-warm-800 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-white"
            aria-label="Clear filter"
            title="Clear filter"
          >
            <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" d="M6 6l12 12M6 18L18 6" />
            </svg>
          </button>
        </div>
      {/if}
    </div>
  </div>

  <!-- Filters + Sort/Group controls -->
  {#if libraryState.books.length > 0}
    <div class="flex items-center justify-between px-6 pb-3">
      <div class="flex items-center gap-1">
        {#each filterOptions as opt}
          <button
            onclick={() => (libraryState.filterBy = opt.value)}
            class="rounded-lg px-2.5 py-1 text-[12px] font-medium transition-all duration-200
              {libraryState.filterBy === opt.value
                ? 'bg-warm-800 text-white shadow-sm shadow-warm-800/20 dark:bg-white dark:text-black dark:shadow-white/10'
                : 'text-warm-500 hover:bg-warm-100/80 hover:text-warm-700 active:scale-[0.96] dark:text-neutral-500 dark:hover:bg-white/[0.05] dark:hover:text-neutral-300'}"
          >
            {opt.label}
          </button>
        {/each}
      </div>
      <div class="flex items-center gap-1.5">
        <!-- Grid / list toggle -->
        <div class="flex items-center rounded-lg p-0.5 ring-1 ring-inset ring-warm-200/80 dark:ring-white/[0.08]" role="group" aria-label="View">
          {#each [{ mode: "grid", label: "Grid view" }, { mode: "list", label: "List view" }] as const as opt}
            <button
              onclick={() => (libraryState.viewMode = opt.mode)}
              aria-pressed={libraryState.viewMode === opt.mode}
              title={opt.label}
              aria-label={opt.label}
              class="flex h-6 w-7 items-center justify-center rounded-md transition-colors
                {libraryState.viewMode === opt.mode
                  ? 'bg-warm-200/70 text-warm-800 dark:bg-white/[0.1] dark:text-white'
                  : 'text-warm-400 hover:text-warm-700 dark:text-neutral-500 dark:hover:text-neutral-300'}"
            >
              {#if opt.mode === "grid"}
                <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="6.5" height="6.5" rx="1.2" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.2" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.2" /></svg>
              {:else}
                <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" fill="currentColor" /><circle cx="4.5" cy="12" r="1" fill="currentColor" /><circle cx="4.5" cy="18" r="1" fill="currentColor" /></svg>
              {/if}
            </button>
          {/each}
        </div>

        <!-- Genre / tag filter -->
        {#if libraryState.allGenres.length || libraryState.allTags.length || libraryState.tagFilter}
          <Dropdown label="Genres and tags" active={libraryState.tagFilter !== null} menuClass="w-[230px]">
            {#snippet trigger()}
              <svg class="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M7 7h.01M7 3h5a1.99 1.99 0 011.41.59l7 7a2 2 0 010 2.82l-7 7a2 2 0 01-2.82 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
              </svg>
              <span class="max-w-[140px] truncate">{libraryState.tagFilter ? libraryState.tagFilter.name : "Genres & tags"}</span>
            {/snippet}
            {#snippet children(close)}
              <DropdownItem checked={libraryState.tagFilter === null} onclick={() => { libraryState.tagFilter = null; close(); }}>All books</DropdownItem>
              {#each [{ kind: "genre", label: "Genres", items: libraryState.allGenres }, { kind: "tag", label: "Tags", items: libraryState.allTags }] as const as section}
                {#if section.items.length}
                  <div class="my-1 border-t border-warm-200/70 dark:border-white/[0.06]"></div>
                  <p class="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-warm-400 dark:text-neutral-500">{section.label}</p>
                  {#each section.items as item}
                    <DropdownItem
                      checked={libraryState.tagFilter?.kind === section.kind && libraryState.tagFilter.name === item.name}
                      trailing={item.count}
                      onclick={() => { libraryState.tagFilter = { kind: section.kind, name: item.name }; close(); }}
                    >
                      {section.kind === "tag" ? "#" : ""}{item.name}
                    </DropdownItem>
                  {/each}
                {/if}
              {/each}
            {/snippet}
          </Dropdown>
        {/if}

        <!-- Group by -->
        <Dropdown label="Group" active={libraryState.groupBy !== "none"}>
          {#snippet trigger()}
            <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 10h16M4 14h8M4 18h8" />
            </svg>
            {groupLabels[libraryState.groupBy]}
          {/snippet}
          {#snippet children(close)}
            {#each groupOptions as opt}
              <DropdownItem checked={libraryState.groupBy === opt.value} onclick={() => { libraryState.groupBy = opt.value; close(); }}>{opt.label}</DropdownItem>
            {/each}
          {/snippet}
        </Dropdown>

        <!-- Sort -->
        <Dropdown label="Sort" active={libraryState.sortBy !== "title"} menuClass="min-w-[170px]">
          {#snippet trigger()}
            <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
            </svg>
            {SORT_LABELS[libraryState.sortBy]}
          {/snippet}
          {#snippet children(close)}
            {#each sortOptions as opt}
              <DropdownItem checked={libraryState.sortBy === opt.value} onclick={() => { libraryState.sortBy = opt.value; close(); }}>{opt.label}</DropdownItem>
            {/each}
          {/snippet}
        </Dropdown>
      </div>
    </div>
  {/if}

  {#if !libraryState.loaded}
    <!-- Waiting for the library to load (the sidebar says "Loading library…"),
         so there's no flash of "No audiobooks yet" -->
    <div class="flex-1"></div>
  {:else if libraryState.filteredBooks.length === 0}
    <div class="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-warm-500 dark:text-neutral-500">
      {#if libraryState.books.length === 0}
        <div class="flex h-20 w-20 items-center justify-center rounded-2xl bg-warm-100 dark:bg-neutral-900">
          <svg class="h-10 w-10 text-warm-300 dark:text-neutral-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        </div>
        <div class="text-center">
          <p class="font-semibold text-warm-800 dark:text-white">No audiobooks yet</p>
          <p class="mt-1 text-[13px]">
            {#if !libraryState.audiobookFolder}
              <button onclick={() => uiState.navigateToSettings()} class="underline underline-offset-2 hover:text-warm-700 dark:hover:text-white">Set your audiobook folder</button> in settings to get started.
            {:else}
              Drag audiobook folders or files onto the window to copy them into your library.
            {/if}
          </p>
        </div>
      {:else}
        <p class="text-[13px]">No books match your filters.</p>
      {/if}
    </div>
  {:else}
    <div class="@container flex-1 overflow-y-auto px-6 pb-6" bind:this={scrollEl} onscroll={onScroll}>
      {#if libraryState.viewMode === "list"}
        <!-- Column headers (click to sort) -->
        <div class="sticky top-0 z-10 -mx-2 bg-canvas">
          <div class="{ROW_COLUMNS} h-8 border-b border-warm-200/80 px-2 text-[11px] font-semibold uppercase tracking-wider text-warm-400 dark:border-white/[0.07] dark:text-neutral-500">
            <span></span>
            {#each sortableColumns as col}
              <button
                onclick={() => (libraryState.sortBy = col.sort)}
                class="flex items-center gap-1 uppercase tracking-wider transition-colors hover:text-warm-700 dark:hover:text-neutral-300
                  {col.align === 'text-right' ? 'justify-end' : ''}
                  {col.sort === 'added' ? 'hidden @2xl:flex' : ''}
                  {libraryState.sortBy === col.sort ? 'text-warm-800 dark:text-white' : ''}"
                title="Sort by {SORT_LABELS[col.sort]}"
              >
                {col.label}
                {#if libraryState.sortBy === col.sort}
                  <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" /></svg>
                {/if}
              </button>
            {/each}
            <span></span>
          </div>
        </div>
      {/if}

      {#each visibleGroups as group}
        {#if group.label}
          <h2 class="mb-2 mt-4 first:mt-0 text-[12px] font-semibold uppercase tracking-wider text-warm-400 dark:text-neutral-500">{group.label}</h2>
        {/if}
        {#if libraryState.viewMode === "list"}
          <div class="-mx-2 {group.label ? 'mb-2' : ''} pt-1">
            {#each group.books as book (book.id)}
              <div data-book-id={book.id} class="[content-visibility:auto] [contain-intrinsic-size:auto_56px]">
                <BookRow {book} />
              </div>
            {/each}
          </div>
        {:else}
          <div class="grid grid-cols-[repeat(auto-fill,minmax(min(180px,40vw),1fr))] gap-5 {group.label ? 'mb-4' : ''} pt-2">
            {#each group.books as book (book.id)}
              <!-- Off-screen cards skip layout and paint. That also clips painting to this box, so it
                   reaches 12px past the card (and gives that back with a negative margin) to leave
                   room for the now-playing ring and the hover shadow. -->
              <div data-book-id={book.id} class="-m-3 p-3 [content-visibility:auto] [contain-intrinsic-size:auto_264px]">
                <BookCard {book} />
              </div>
            {/each}
          </div>
        {/if}
      {/each}
    </div>
  {/if}
</div>
