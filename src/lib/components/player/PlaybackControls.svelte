<script lang="ts">
  import { playerState } from "../../state/player.svelte";
  import { settingsState } from "../../state/settings.svelte";

  let hasPrev = $derived(playerState.currentChapterIndex > 0);
  let hasNext = $derived(
    playerState.currentChapterIndex < playerState.currentChapters.length - 1,
  );

  function prevChapter() {
    // Like Spotify: restart the current chapter first, jump back on a quick second press
    if (playerState.currentTime > 5 || !hasPrev) {
      playerState.seek(0);
    } else {
      playerState.goToChapter(playerState.currentChapterIndex - 1);
    }
  }

  function nextChapter() {
    if (hasNext) {
      playerState.goToChapter(playerState.currentChapterIndex + 1);
    }
  }
</script>

<div class="flex items-center gap-1.5">
  <!-- Previous chapter -->
  <button
    onclick={prevChapter}
    class="flex h-8 w-8 items-center justify-center rounded-full text-warm-500 transition-all duration-200 hover:text-warm-900 active:scale-90 dark:text-neutral-400 dark:hover:text-white"
    title="Previous chapter"
  >
    <svg class="h-[18px] w-[18px]" fill="currentColor" viewBox="0 0 24 24">
      <path d="M6 6h2v12H6V6zm3.5 6L18 18V6l-8.5 6z" />
    </svg>
  </button>

  <!-- Skip back -->
  <button
    onclick={() => playerState.skipBackward(settingsState.skipBackSecs)}
    class="flex h-10 w-10 items-center justify-center rounded-full text-warm-600 transition-all duration-200 hover:text-warm-900 active:scale-90 dark:text-neutral-300 dark:hover:text-white"
    title="Back {settingsState.skipBackSecs}s"
    aria-label="Back {settingsState.skipBackSecs} seconds"
  >
    <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  </button>

  <!-- Play/Pause — filled, prominent -->
  <button
    onclick={() => playerState.togglePlayPause()}
    class="btn-primary mx-1 flex h-10 w-10 items-center justify-center rounded-full hover:scale-105 active:scale-95"
    title={playerState.isPlaying ? "Pause" : "Play"}
  >
    {#if playerState.isPlaying}
      <svg class="h-[18px] w-[18px]" fill="currentColor" viewBox="0 0 24 24">
        <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
      </svg>
    {:else}
      <svg class="ml-0.5 h-[18px] w-[18px]" fill="currentColor" viewBox="0 0 24 24">
        <path d="M8 5v14l11-7z" />
      </svg>
    {/if}
  </button>

  <!-- Skip forward -->
  <button
    onclick={() => playerState.skipForward(settingsState.skipForwardSecs)}
    class="flex h-10 w-10 items-center justify-center rounded-full text-warm-600 transition-all duration-200 hover:text-warm-900 active:scale-90 dark:text-neutral-300 dark:hover:text-white"
    title="Forward {settingsState.skipForwardSecs}s"
    aria-label="Forward {settingsState.skipForwardSecs} seconds"
  >
    <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
    </svg>
  </button>

  <!-- Next chapter -->
  <button
    onclick={nextChapter}
    disabled={!hasNext}
    class="flex h-8 w-8 items-center justify-center rounded-full text-warm-500 transition-all duration-200 hover:text-warm-900 active:scale-90 disabled:pointer-events-none disabled:opacity-30 dark:text-neutral-400 dark:hover:text-white"
    title="Next chapter"
  >
    <svg class="h-[18px] w-[18px]" fill="currentColor" viewBox="0 0 24 24">
      <path d="M6 18l8.5-6L6 6v12zM16 6h2v12h-2V6z" />
    </svg>
  </button>
</div>
