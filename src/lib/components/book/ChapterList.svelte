<script lang="ts">
  import type { Chapter } from "../../types";
  import { playerState } from "../../state/player.svelte";
  import { formatDuration } from "../../utils/format";

  import { uiState } from "../../state/ui.svelte";
  import { libraryState } from "../../state/library.svelte";

  let { chapters }: { chapters: Chapter[] } = $props();

  let isCurrentBook = $derived(playerState.currentBookId === uiState.selectedBookId);

  // Chapters before the one you're on count as finished (all of them once the book
  // is). Live for the book that's playing, from saved progress for the others.
  let progress = $derived(uiState.selectedBookId !== null ? libraryState.progressMap.get(uiState.selectedBookId) : undefined);
  let finishedBefore = $derived(
    progress?.finished_at
      ? chapters.length
      : isCurrentBook
        ? playerState.currentChapterIndex
        : progress && progress.book_position_secs > 0
          ? progress.chapter_index
          : 0,
  );

  // A single click only selects a chapter; playing needs a double-click (or Enter),
  // so a stray click can't jump away from what you're listening to.
  let selectedIndex = $state<number | null>(null);

  $effect(() => {
    chapters;
    selectedIndex = null;
  });

  function play(i: number) {
    if (isCurrentBook) playerState.goToChapter(i);
    else if (uiState.selectedBookId !== null)
      playerState.openBook(uiState.selectedBookId, { chapterIndex: i, positionSecs: 0 });
  }
</script>

<div class="space-y-0.5">
  {#each chapters as chapter, i (chapter.id)}
    {@const isActive = isCurrentBook && playerState.currentChapterIndex === i}
    {@const isSelected = selectedIndex === i && !isActive}
    {@const isDone = i < finishedBefore && !isActive}
    <button
      onclick={() => (selectedIndex = i)}
      ondblclick={() => play(i)}
      onkeydown={(e) => {
        // Buttons turn Enter/Space into a click; make them play instead
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          play(i);
        }
      }}
      title="Double-click to play"
      class="flex w-full select-none items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] transition-colors
        {isActive
          ? 'bg-warm-800/5 dark:bg-white/5'
          : isSelected
            ? 'bg-warm-200/60 dark:bg-white/[0.07]'
            : 'hover:bg-warm-100 dark:hover:bg-neutral-900'}"
    >
      <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[11px] font-semibold tabular-nums
        {isActive ? 'bg-accent-500 text-accent-fg' : isDone ? 'text-accent-600 dark:text-accent-400' : 'text-warm-400 dark:text-neutral-400'}">
        {#if isDone}
          <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.75" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <span class="sr-only">Finished, chapter {i + 1}</span>
        {:else}
          {i + 1}
        {/if}
      </span>

      <span class="flex-1 truncate {isActive ? 'font-semibold text-accent-600 dark:text-accent-400' : isDone ? 'text-warm-500 dark:text-neutral-500' : ''}">
        {chapter.title}
      </span>

      <span class="shrink-0 text-[11px] tabular-nums text-warm-400 dark:text-neutral-400">
        {formatDuration(chapter.duration_secs)}
      </span>

      {#if isActive && playerState.isPlaying}
        <div class="waveform-bars h-3.5 shrink-0">
          <span class="bg-accent-500"></span>
          <span class="bg-accent-500"></span>
          <span class="bg-accent-500"></span>
          <span class="bg-accent-500"></span>
          <span class="bg-accent-500"></span>
        </div>
      {/if}
    </button>
  {/each}
</div>
