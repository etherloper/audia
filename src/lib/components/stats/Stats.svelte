<script lang="ts">
  import { onMount } from "svelte";
  import { libraryState } from "../../state/library.svelte";
  import { getDb } from "../../utils/db";
  import ListeningHistory from "./ListeningHistory.svelte";

  let totalListenedSecs = $state(0);
  let loading = $state(true);

  onMount(async () => {
    const db = await getDb();
    const result = await db.select<{ total: number }[]>(
      "SELECT COALESCE(SUM(listened_secs), 0) as total FROM progress",
    );
    totalListenedSecs = result[0]?.total ?? 0;
    loading = false;
  });

  let hours = $derived(Math.floor(totalListenedSecs / 3600));
  let minutes = $derived(Math.floor((totalListenedSecs % 3600) / 60));
  let seconds = $derived(Math.floor(totalListenedSecs % 60));

  let booksFinished = $derived(
    libraryState.books.filter((b) => libraryState.progressMap.get(b.id)?.finished_at).length,
  );

  let booksInProgress = $derived.by(() => {
    return libraryState.books.filter((b) => {
      const prog = libraryState.progressMap.get(b.id);
      return !!prog && prog.book_position_secs > 0 && !prog.finished_at;
    }).length;
  });

  let booksNotStarted = $derived(libraryState.books.length - booksFinished - booksInProgress);
  let booksTotal = $derived(libraryState.books.length);
  let booksFavourited = $derived(libraryState.books.filter((b) => b.is_favourite === 1).length);

  let completionPct = $derived(booksTotal > 0 ? Math.round((booksFinished / booksTotal) * 100) : 0);
  let circumference = 2 * Math.PI * 34;
  let strokeDashoffset = $derived(circumference - (completionPct / 100) * circumference);
</script>

<div class="flex h-full flex-col overflow-y-auto">
  <!-- Header -->
  <div class="px-6 pt-5 pb-4">
    <h1 class="text-xl font-bold tracking-tight">Stats</h1>
    <p class="mt-0.5 text-[13px] text-warm-500 dark:text-neutral-500">Your listening journey</p>
  </div>

  {#if loading}
    <div class="flex flex-1 items-center justify-center">
      <div class="h-5 w-5 animate-spin rounded-full border-2 border-warm-300 border-t-warm-700 dark:border-neutral-700 dark:border-t-neutral-300"></div>
    </div>
  {:else}
    <div class="space-y-4 px-6 pb-8">

      <!-- Hero: Total Time Listened -->
      <div class="relative overflow-hidden rounded-2xl bg-warm-800 p-6 text-white dark:bg-neutral-900 dark:ring-1 dark:ring-white/[0.08]">
        <!-- Subtle texture overlay -->
        <div class="absolute inset-0 opacity-[0.04]" style="background-image: radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px); background-size: 60px 60px;"></div>

        <p class="relative text-[11px] font-semibold uppercase tracking-[0.12em] text-white/50">Total Time Listened</p>

        {#if totalListenedSecs === 0}
          <div class="relative mt-4">
            <p class="text-[15px] font-medium text-white/60">No listening time recorded yet.</p>
            <p class="mt-1 text-[12px] text-white/40">Start listening to track your progress.</p>
          </div>
        {:else}
          <div class="relative mt-4 flex items-end gap-5">
            {#if hours > 0}
              <div class="flex flex-col items-center">
                <span class="text-[52px] font-bold leading-none tabular-nums tracking-tight">{hours}</span>
                <span class="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45">hours</span>
              </div>
              <span class="mb-3.5 text-[28px] font-light text-white/30">:</span>
            {/if}
            <div class="flex flex-col items-center">
              <span class="text-[52px] font-bold leading-none tabular-nums tracking-tight">{String(minutes).padStart(hours > 0 ? 2 : 1, '0')}</span>
              <span class="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45">min</span>
            </div>
            <span class="mb-3.5 text-[28px] font-light text-white/30">:</span>
            <div class="flex flex-col items-center">
              <span class="text-[52px] font-bold leading-none tabular-nums tracking-tight">{String(seconds).padStart(2, '0')}</span>
              <span class="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45">sec</span>
            </div>
          </div>
        {/if}
      </div>

      <ListeningHistory />

      <!-- Library Overview: completion ring + breakdown -->
      <div class="grid grid-cols-2 gap-3">
        <!-- Completion ring card -->
        <div class="flex flex-col items-center justify-center rounded-2xl border border-warm-200/50 bg-warm-100/20 px-4 py-5 dark:border-white/[0.06] dark:bg-white/[0.02]">
          <div class="relative">
            <svg class="h-[88px] w-[88px] -rotate-90" viewBox="0 0 80 80">
              <circle
                cx="40" cy="40" r="34"
                fill="none"
                stroke="currentColor"
                stroke-width="6"
                class="text-warm-200/60 dark:text-white/[0.06]"
              />
              <circle
                cx="40" cy="40" r="34"
                fill="none"
                stroke="currentColor"
                stroke-width="6"
                stroke-linecap="round"
                stroke-dasharray={circumference}
                stroke-dashoffset={strokeDashoffset}
                class="text-warm-700 dark:text-white transition-all duration-700 ease-out"
              />
            </svg>
            <div class="absolute inset-0 flex flex-col items-center justify-center">
              <span class="text-[22px] font-bold tabular-nums leading-none">{completionPct}</span>
              <span class="text-[10px] font-medium text-warm-500 dark:text-neutral-500">%</span>
            </div>
          </div>
          <p class="mt-2 text-[12px] font-semibold text-warm-700 dark:text-neutral-300">Completion</p>
          <p class="text-[11px] text-warm-400 dark:text-neutral-500">{booksFinished} of {booksTotal} books</p>
        </div>

        <!-- Book breakdown stacked card -->
        <div class="flex flex-col justify-center gap-3 rounded-2xl border border-warm-200/50 bg-warm-100/20 px-4 py-5 dark:border-white/[0.06] dark:bg-white/[0.02]">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <div class="h-2 w-2 rounded-full bg-warm-700 dark:bg-white/70"></div>
              <span class="text-[12px] text-warm-600 dark:text-neutral-400">Finished</span>
            </div>
            <span class="text-[14px] font-bold tabular-nums text-warm-800 dark:text-white">{booksFinished}</span>
          </div>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <div class="h-2 w-2 rounded-full bg-warm-400 dark:bg-neutral-500"></div>
              <span class="text-[12px] text-warm-600 dark:text-neutral-400">In Progress</span>
            </div>
            <span class="text-[14px] font-bold tabular-nums text-warm-800 dark:text-white">{booksInProgress}</span>
          </div>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <div class="h-2 w-2 rounded-full bg-warm-200 dark:bg-neutral-700"></div>
              <span class="text-[12px] text-warm-600 dark:text-neutral-400">Not Started</span>
            </div>
            <span class="text-[14px] font-bold tabular-nums text-warm-800 dark:text-white">{booksNotStarted}</span>
          </div>
        </div>
      </div>

      <!-- Bottom row of cards -->
      <div class="grid grid-cols-3 gap-3">
        <!-- Total books -->
        <div class="flex flex-col gap-1 rounded-2xl border border-warm-200/50 bg-warm-100/20 px-4 py-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
          <svg class="h-5 w-5 text-warm-400 dark:text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.6">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <span class="text-[26px] font-bold tabular-nums leading-tight text-warm-800 dark:text-white">{booksTotal}</span>
          <span class="text-[11px] font-medium text-warm-400 dark:text-neutral-500">Books</span>
        </div>

        <!-- Favourites -->
        <div class="flex flex-col gap-1 rounded-2xl border border-warm-200/50 bg-warm-100/20 px-4 py-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
          <svg class="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 24 24">
            <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
          </svg>
          <span class="text-[26px] font-bold tabular-nums leading-tight text-warm-800 dark:text-white">{booksFavourited}</span>
          <span class="text-[11px] font-medium text-warm-400 dark:text-neutral-500">Favourites</span>
        </div>

        <!-- Series -->
        <div class="flex flex-col gap-1 rounded-2xl border border-warm-200/50 bg-warm-100/20 px-4 py-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
          <svg class="h-5 w-5 text-warm-400 dark:text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.6">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          <span class="text-[26px] font-bold tabular-nums leading-tight text-warm-800 dark:text-white">
            {new Set(libraryState.books.filter(b => b.series).map(b => b.series)).size}
          </span>
          <span class="text-[11px] font-medium text-warm-400 dark:text-neutral-500">Series</span>
        </div>
      </div>

      <!-- Progress bar visualization -->
      {#if booksTotal > 0}
        <div class="rounded-2xl border border-warm-200/50 bg-warm-100/20 px-5 py-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
          <p class="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-warm-400 dark:text-neutral-500">Library Breakdown</p>
          <div class="flex h-2 overflow-hidden rounded-full">
            {#if booksFinished > 0}
              <div
                class="bg-warm-700 dark:bg-white/70 transition-all duration-700"
                style="width: {(booksFinished / booksTotal) * 100}%"
              ></div>
            {/if}
            {#if booksInProgress > 0}
              <div
                class="bg-warm-400 dark:bg-neutral-500 transition-all duration-700"
                style="width: {(booksInProgress / booksTotal) * 100}%"
              ></div>
            {/if}
            {#if booksNotStarted > 0}
              <div
                class="bg-warm-200/60 dark:bg-neutral-800 transition-all duration-700"
                style="width: {(booksNotStarted / booksTotal) * 100}%"
              ></div>
            {/if}
          </div>
          <div class="mt-3 flex items-center gap-4">
            <div class="flex items-center gap-1.5">
              <div class="h-2 w-2 rounded-full bg-warm-700 dark:bg-white/70"></div>
              <span class="text-[11px] text-warm-500 dark:text-neutral-500">Finished</span>
            </div>
            <div class="flex items-center gap-1.5">
              <div class="h-2 w-2 rounded-full bg-warm-400 dark:bg-neutral-500"></div>
              <span class="text-[11px] text-warm-500 dark:text-neutral-500">In Progress</span>
            </div>
            <div class="flex items-center gap-1.5">
              <div class="h-2 w-2 rounded-full bg-warm-200/80 dark:bg-neutral-800"></div>
              <span class="text-[11px] text-warm-500 dark:text-neutral-500">Not Started</span>
            </div>
          </div>
        </div>
      {/if}

    </div>
  {/if}
</div>
