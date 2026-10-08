<script lang="ts">
  import type { Book } from "../../types";
  import { libraryState } from "../../state/library.svelte";
  import { uiState } from "../../state/ui.svelte";
  import BookCard from "../library/BookCard.svelte";
  import ShelfCarousel from "../shared/ShelfCarousel.svelte";

  let continueListening = $derived.by((): Book[] => {
    const result: { book: Book; updatedAt: string }[] = [];
    for (const book of libraryState.books) {
      const prog = libraryState.progressMap.get(book.id);
      if (!prog || prog.book_position_secs <= 0) continue;
      if (prog.finished_at) continue;
      result.push({ book, updatedAt: prog.updated_at });
    }
    result.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return result.map((r) => r.book);
  });

  // Shelves are horizontal rows showing a few books at a time; "See all" opens the full list
  const SHELF_LIMIT = 20;

  let favourites = $derived.by((): Book[] => {
    return libraryState.books
      .filter((b) => b.is_favourite === 1)
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  });

  // Newest first; skips books you've already started or finished, so the shelf is
  // about what's new to you rather than repeating Continue Listening
  let recentlyAdded = $derived(
    libraryState.books
      .filter((b) => !libraryState.progressMap.get(b.id)?.book_position_secs && !libraryState.isFinished(b.id))
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id),
  );

  function seeAllRecentlyAdded() {
    libraryState.filterBy = "not-started";
    libraryState.sortBy = "added";
    uiState.navigateToLibrary();
  }

  function seeAllInProgress() {
    libraryState.filterBy = "in-progress";
    uiState.navigateToLibrary();
  }

  function seeAllFavourites() {
    libraryState.filterBy = "favourites";
    uiState.navigateToLibrary();
  }

  const hour = new Date().getHours();
  const greeting =
    hour < 5 ? "Good evening" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
</script>

<div class="h-full overflow-y-auto px-6 pt-6 pb-6">
  <div class="mx-auto max-w-[1400px]">
    <h1 class="text-2xl font-bold tracking-tight">{greeting}</h1>

    <!-- Shelves wait for the library to load (the sidebar says "Loading library…"),
         so there's no flash of "Your library is empty" -->
    {#if libraryState.loaded}
      <!-- Continue Listening -->
      <section class="mt-6">
        <div class="mb-3 flex items-end justify-between">
          <div>
            <h2 class="text-[15px] font-semibold">Continue Listening</h2>
            <p class="mt-0.5 text-[12px] text-warm-500 dark:text-neutral-500">
              Pick up where you left off
            </p>
          </div>
          {#if continueListening.length > 0}
            <button
              onclick={seeAllInProgress}
              class="text-[12px] font-medium text-warm-500 transition-colors hover:text-warm-800 dark:text-neutral-500 dark:hover:text-white"
            >
              See all →
            </button>
          {/if}
        </div>

        {#if continueListening.length === 0}
          <div class="flex items-center gap-3 rounded-xl border border-dashed border-warm-200 bg-warm-50/60 px-4 py-5 text-[13px] text-warm-500 dark:border-neutral-800 dark:bg-neutral-900/40 dark:text-neutral-500">
            <svg class="h-5 w-5 shrink-0 text-warm-400 dark:text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
              <path stroke-linecap="round" stroke-linejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Start playing any book and it'll appear here.</span>
          </div>
        {:else}
          <ShelfCarousel label="Continue listening">
            {#each continueListening.slice(0, SHELF_LIMIT) as book (book.id)}
              <div class="w-[180px] shrink-0 snap-start">
                <BookCard {book} />
              </div>
            {/each}
          </ShelfCarousel>
        {/if}
      </section>

      <!-- Recently added -->
      {#if recentlyAdded.length > 0}
        <section class="mt-8">
          <div class="mb-3 flex items-end justify-between">
            <div>
              <h2 class="text-[15px] font-semibold">Recently Added</h2>
              <p class="mt-0.5 text-[12px] text-warm-500 dark:text-neutral-500">
                New to your library and not started yet
              </p>
            </div>
            <button
              onclick={seeAllRecentlyAdded}
              class="text-[12px] font-medium text-warm-500 transition-colors hover:text-warm-800 dark:text-neutral-500 dark:hover:text-white"
            >
              See all →
            </button>
          </div>
          <ShelfCarousel label="Recently added">
            {#each recentlyAdded.slice(0, SHELF_LIMIT) as book (book.id)}
              <div class="w-[180px] shrink-0 snap-start">
                <BookCard {book} />
              </div>
            {/each}
          </ShelfCarousel>
        </section>
      {/if}

      <!-- Favourites -->
      <section class="mt-8">
        <div class="mb-3 flex items-end justify-between">
          <div>
            <h2 class="text-[15px] font-semibold">Favourites</h2>
            <p class="mt-0.5 text-[12px] text-warm-500 dark:text-neutral-500">
              Books you've starred
            </p>
          </div>
          {#if favourites.length > 0}
            <button
              onclick={seeAllFavourites}
              class="text-[12px] font-medium text-warm-500 transition-colors hover:text-warm-800 dark:text-neutral-500 dark:hover:text-white"
            >
              See all →
            </button>
          {/if}
        </div>

        {#if favourites.length === 0}
          <div class="flex items-center gap-3 rounded-xl border border-dashed border-warm-200 bg-warm-50/60 px-4 py-5 text-[13px] text-warm-500 dark:border-neutral-800 dark:bg-neutral-900/40 dark:text-neutral-500">
            <svg class="h-5 w-5 shrink-0 text-warm-400 dark:text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
              <path stroke-linecap="round" stroke-linejoin="round" d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
            </svg>
            <span>Right-click a book (or use its ⋯ button) and choose Add to Favourites.</span>
          </div>
        {:else}
          <ShelfCarousel label="Favourites">
            {#each favourites.slice(0, SHELF_LIMIT) as book (book.id)}
              <div class="w-[180px] shrink-0 snap-start">
                <BookCard {book} />
              </div>
            {/each}
          </ShelfCarousel>
        {/if}
      </section>

      {#if libraryState.books.length === 0}
        <section class="mt-8 flex flex-col items-center justify-center gap-3 rounded-2xl border border-warm-200/70 bg-warm-50/60 px-6 py-12 text-center dark:border-neutral-800 dark:bg-neutral-900/40">
          <div class="flex h-16 w-16 items-center justify-center rounded-2xl bg-warm-100 dark:bg-neutral-900">
            <svg class="h-8 w-8 text-warm-300 dark:text-neutral-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <div>
            <p class="font-semibold text-warm-800 dark:text-white">Your library is empty</p>
            <p class="mt-1 text-[13px] text-warm-500 dark:text-neutral-500">
              {#if !libraryState.audiobookFolder}
                <button onclick={() => uiState.navigateToSettings()} class="underline underline-offset-2 hover:text-warm-700 dark:hover:text-white">Set your audiobook folder</button> to get started.
              {:else}
                Drag a folder onto the library to add books.
              {/if}
            </p>
          </div>
        </section>
      {/if}
    {/if}
  </div>
</div>

