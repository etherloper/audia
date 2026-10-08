<script lang="ts">
  import { playerState } from "../../state/player.svelte";
  import { settingsState } from "../../state/settings.svelte";
  import { formatDuration } from "../../utils/format";
  import { chapterBoundaries } from "../../utils/playback";

  // The bar spans either the current chapter or the whole book (Settings, or click the time)
  let wholeBook = $derived(settingsState.progressScope === "book" && playerState.currentChapters.length > 1);
  let position = $derived(wholeBook ? playerState.bookPositionSecs : playerState.currentTime);
  let length = $derived(wholeBook ? playerState.bookDurationSecs : playerState.duration);

  let fillPercent = $derived(length > 0 ? Math.min(100, (position / length) * 100) : 0);
  let remaining = $derived(Math.max(0, length - position));

  // Chapter starts as tick marks on the whole-book bar (skipped when there are too many to read)
  let ticks = $derived.by(() => {
    if (!wholeBook || length <= 0) return [];
    const starts = chapterBoundaries(playerState.currentChapters);
    return starts.length <= 60 ? starts.map((t) => (t / length) * 100) : [];
  });

  function handleInput(e: Event) {
    const value = parseFloat((e.target as HTMLInputElement).value);
    if (wholeBook) playerState.seekBook(value);
    else playerState.seek(value);
  }

  // Hover preview: the time (and, on the whole-book bar, the chapter) under the cursor
  let hoverFraction = $state<number | null>(null);

  function trackHover(e: PointerEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    hoverFraction = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  }

  let hoverTime = $derived(hoverFraction === null ? 0 : hoverFraction * length);
  let hoverChapterTitle = $derived.by(() => {
    if (!wholeBook || hoverFraction === null) return null;
    const starts = chapterBoundaries(playerState.currentChapters);
    const index = starts.filter((s) => s <= hoverTime).length;
    return playerState.currentChapters[index]?.title ?? null;
  });

  function toggleScope() {
    settingsState.progressScope = settingsState.progressScope === "book" ? "chapter" : "book";
  }
</script>

<div class="group/progress flex items-center gap-3">
  <span class="w-12 text-right text-[11px] tabular-nums text-warm-400 dark:text-neutral-500">
    {formatDuration(position)}
  </span>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- Hover tracking only; seeking is done by the range input inside -->
  <div
    class="relative flex-1 h-5 flex items-center cursor-pointer"
    onpointermove={trackHover}
    onpointerleave={() => (hoverFraction = null)}
  >
    <!-- Track background -->
    <div class="absolute left-0 right-0 h-1 rounded-full bg-warm-200/80 dark:bg-white/[0.09]"></div>
    <!-- Fill -->
    <div
      class="absolute left-0 h-1 rounded-full bg-warm-800 transition-colors duration-200 group-hover/progress:bg-accent-500 dark:bg-white dark:group-hover/progress:bg-accent-500"
      style="width: {fillPercent}%"
    ></div>
    <!-- Chapter boundaries (whole-book mode): small gaps cut in the bar, in the surface colour -->
    {#each ticks as left}
      <div class="chrome-gap pointer-events-none absolute h-1 w-[2px] -translate-x-1/2" style="left: {left}%"></div>
    {/each}
    <!-- Scrub handle -->
    <div
      class="pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 scale-0 rounded-full bg-warm-800 shadow-md shadow-black/25 transition-transform duration-150 group-hover/progress:scale-100 dark:bg-white"
      style="left: {fillPercent}%"
    ></div>
    <!-- Hover tooltip, kept inside the bar's ends -->
    {#if hoverFraction !== null && length > 0}
      <div
        class="tooltip-surface pointer-events-none absolute bottom-full z-20 mb-1.5 flex max-w-[240px] -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums"
        style="left: clamp(24px, {hoverFraction * 100}%, calc(100% - 24px))"
      >
        <span>{formatDuration(hoverTime)}</span>
        {#if hoverChapterTitle}
          <span class="truncate font-medium opacity-70">{hoverChapterTitle}</span>
        {/if}
      </div>
    {/if}
    <!-- Invisible range input -->
    <input
      type="range"
      min="0"
      max={length || 0}
      step="0.1"
      value={position}
      oninput={handleInput}
      aria-label={wholeBook ? "Position in book" : "Position in chapter"}
      class="progress-slider absolute inset-0 z-10 w-full cursor-pointer"
    />
  </div>
  <button
    onclick={toggleScope}
    class="w-12 text-left text-[11px] tabular-nums text-warm-400 transition-colors hover:text-warm-700 dark:text-neutral-500 dark:hover:text-neutral-300"
    title={wholeBook ? "Time left in book — click to show the chapter" : "Time left in chapter — click to show the whole book"}
  >
    -{formatDuration(remaining)}
  </button>
</div>

<style>
  .progress-slider {
    appearance: none;
    -webkit-appearance: none;
    background: transparent !important;
    height: 20px !important;
    opacity: 0;
  }
  .progress-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 16px;
    height: 16px;
    background: transparent;
    cursor: pointer;
  }
  /* Gap colour matches the player bar's background (set on .chrome in app.css) */
  .chrome-gap {
    background: var(--chrome-bg);
  }
</style>
