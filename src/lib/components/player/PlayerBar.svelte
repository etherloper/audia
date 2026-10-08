<script lang="ts">
  import { onMount } from "svelte";
  import { playerState } from "../../state/player.svelte";
  import { libraryState } from "../../state/library.svelte";
  import { uiState } from "../../state/ui.svelte";
  import { coverSrc } from "../../utils/covers";
  import { formatTimeLeft } from "../../utils/format";
  import ProgressBar from "./ProgressBar.svelte";
  import PlaybackControls from "./PlaybackControls.svelte";
  import SleepTimer from "./SleepTimer.svelte";
  import ChapterMenu from "./ChapterMenu.svelte";
  import SpeedSlider from "../shared/SpeedSlider.svelte";
  import { miniPlayerState } from "../../state/miniPlayer.svelte";

  let book = $derived(
    playerState.currentBookId !== null
      ? libraryState.getBook(playerState.currentBookId)
      : null,
  );

  let showSpeedMenu = $state(false);
  let speedMenuEl: HTMLDivElement | undefined = $state();

  onMount(() => {
    function handleClickOutside(e: MouseEvent) {
      if (showSpeedMenu && speedMenuEl && !speedMenuEl.contains(e.target as Node)) {
        showSpeedMenu = false;
      }
    }
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  });

  function addBookmark() {
    playerState.addBookmark();
  }
</script>

{#if playerState.currentBookId !== null}
  <div class="chrome relative z-10 shrink-0 border-t px-4 py-2">
    <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
      <!-- Left: cover + info -->
      <div class="flex min-w-0 justify-start">
        <button
          onclick={() => {
            if (playerState.currentBookId !== null) {
              uiState.navigateToBook(playerState.currentBookId);
            }
          }}
          class="flex min-w-0 max-w-[260px] items-center gap-3 rounded-xl p-1.5 transition-all duration-200 hover:bg-warm-200/40 active:scale-[0.98] dark:hover:bg-white/[0.04]"
        >
          {#if book?.cover_art}
            <div class="h-12 w-12 shrink-0 overflow-hidden rounded-md shadow-md shadow-black/20 ring-1 ring-black/5 dark:ring-white/10">
              <img src={coverSrc(book.cover_art)} alt="" class="h-full w-full object-cover" />
            </div>
          {:else}
            <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-warm-200/60 dark:bg-white/[0.06]">
              <svg class="h-4 w-4 text-warm-400 dark:text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
          {/if}
          <div class="min-w-0 text-left">
            <p class="truncate text-[13px] font-semibold leading-tight">
              {book?.title ?? "Unknown"}
            </p>
            <p class="mt-0.5 flex min-w-0 gap-1 text-[11px] leading-tight text-warm-500 dark:text-neutral-500">
              <span class="truncate">{playerState.currentChapter?.title ?? ""}</span>
              <!-- Real time left in the book at the current speed -->
              <span
                class="shrink-0 tabular-nums text-warm-400 dark:text-neutral-600"
                title="Time left in book at {playerState.playbackRate}×"
              >
                &middot; {formatTimeLeft(playerState.bookRemainingSecs / playerState.playbackRate)} left
              </span>
            </p>
          </div>
        </button>
      </div>

      <!-- Center: transport controls stacked over the seek bar -->
      <div class="flex w-[42vw] min-w-[340px] max-w-[620px] flex-col items-center gap-0.5">
        <PlaybackControls />
        <div class="w-full">
          <ProgressBar />
        </div>
      </div>

      <!-- Right: speed, bookmark, sleep timer, volume -->
      <div class="flex items-center justify-end gap-1">
        <div class="relative" bind:this={speedMenuEl}>
          <button
            onclick={() => (showSpeedMenu = !showSpeedMenu)}
            class="flex h-8 min-w-[42px] items-center justify-center rounded-lg px-2 text-[12px] font-bold tabular-nums transition-all duration-200 active:scale-95
              {playerState.playbackRate !== 1
                ? 'text-accent-600 hover:bg-warm-200/50 dark:text-accent-400 dark:hover:bg-white/[0.06]'
                : 'text-warm-500 hover:bg-warm-200/50 hover:text-warm-800 dark:text-neutral-400 dark:hover:bg-white/[0.06] dark:hover:text-white'}"
            title="Playback speed"
          >
            {playerState.playbackRate}x
          </button>
          {#if showSpeedMenu}
            <div
              role="dialog"
              aria-label="Playback speed"
              class="menu-surface animate-scaleIn absolute bottom-full left-1/2 mb-2 w-[260px] -translate-x-1/2 rounded-xl border px-4 pb-3 pt-3.5 shadow-xl shadow-black/10 dark:shadow-black/40"
            >
              <div class="mb-3 flex items-baseline justify-between">
                <p class="text-[11px] font-semibold uppercase tracking-wider text-warm-400 dark:text-neutral-500">Speed</p>
                <div class="flex items-baseline gap-2">
                  {#if playerState.playbackRate !== 1}
                    <button
                      onclick={() => playerState.setPlaybackRate(1)}
                      class="text-[11px] font-medium text-warm-400 transition-colors hover:text-warm-800 dark:text-neutral-500 dark:hover:text-white"
                    >
                      Reset
                    </button>
                  {/if}
                  <p class="text-[17px] font-bold tabular-nums">{playerState.playbackRate}×</p>
                </div>
              </div>
              <SpeedSlider value={playerState.playbackRate} onchange={(v) => playerState.setPlaybackRate(v)} />
            </div>
          {/if}
        </div>

        <ChapterMenu />
        <button
          onclick={addBookmark}
          class="flex h-8 w-8 items-center justify-center rounded-lg text-warm-400 transition-all duration-200 hover:bg-warm-200/40 hover:text-warm-800 active:scale-90 dark:text-neutral-500 dark:hover:bg-white/[0.06] dark:hover:text-white"
          title="Add bookmark (B)"
        >
          <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
        </button>
        <SleepTimer />
        <button
          onclick={() => miniPlayerState.enter()}
          class="flex h-8 w-8 items-center justify-center rounded-lg text-warm-400 transition-all duration-200 hover:bg-warm-200/40 hover:text-warm-800 active:scale-90 dark:text-neutral-500 dark:hover:bg-white/[0.06] dark:hover:text-white"
          title="Mini player (Ctrl+Shift+M)"
          aria-label="Switch to mini player"
        >
          <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <rect x="12" y="12" width="8" height="6" rx="1" fill="currentColor" stroke="none" />
          </svg>
        </button>

        <!-- Volume: the slider slides out while the speaker (or the slider) is hovered
             or focused, and lingers briefly after the mouse leaves -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="group/volume relative ml-1 flex items-center"
          onwheel={(e) => {
            e.preventDefault();
            const delta = e.deltaY < 0 ? 0.05 : -0.05;
            playerState.setVolume(Math.min(1, Math.max(0, playerState.volume + delta)));
          }}
        >
          <button
            onclick={() => playerState.toggleMute()}
            class="flex h-8 w-8 items-center justify-center rounded-lg text-warm-500 transition-all duration-200 hover:text-warm-800 active:scale-90 dark:text-neutral-400 dark:hover:text-white"
            title={playerState.volume > 0 ? "Mute" : "Unmute"}
          >
            {#if playerState.volume === 0}
              <svg class="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            {:else if playerState.volume < 0.5}
              <svg class="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15.536 8.464a5 5 0 010 7.072M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              </svg>
            {:else}
              <svg class="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              </svg>
            {/if}
          </button>
          <div
            class="flex w-0 items-center overflow-hidden opacity-0 transition-[width,opacity] delay-300 duration-300 ease-out
              group-focus-within/volume:w-[92px] group-focus-within/volume:opacity-100 group-focus-within/volume:delay-0
              group-hover/volume:w-[92px] group-hover/volume:opacity-100 group-hover/volume:delay-0"
          >
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={playerState.volume}
              oninput={(e) => {
                const target = e.target as HTMLInputElement;
                playerState.setVolume(parseFloat(target.value));
                target.style.setProperty('--vol-fill', `${parseFloat(target.value) * 100}%`);
              }}
              aria-label="Volume"
              aria-valuetext="{Math.round(playerState.volume * 100)}%"
              class="vol-slider ml-1.5 shrink-0"
              style="--vol-fill: {playerState.volume * 100}%"
            />
          </div>
          <!-- Value bubble over the thumb. Outside the sliding box, which clips.
               Thumb centre: 32px button + 6px margin + 5.5px half-thumb + 69px travel. -->
          <span
            class="tooltip-surface pointer-events-none absolute bottom-full mb-2 -translate-x-1/2 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums opacity-0 transition-opacity duration-150 group-hover/volume:opacity-100 group-hover/volume:delay-150 group-focus-within/volume:opacity-100"
            style="left: {43.5 + 69 * playerState.volume}px"
          >
            {Math.round(playerState.volume * 100)}%
          </span>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .vol-slider {
    width: 80px;
    height: 4px;
    appearance: none;
    -webkit-appearance: none;
    border-radius: 2px;
    outline: none;
    cursor: pointer;
  }
  :global(html.dark) .vol-slider {
    background: linear-gradient(to right, white var(--vol-fill, 100%), rgba(255, 255, 255, 0.1) var(--vol-fill, 100%));
  }
  :global(html:not(.dark)) .vol-slider {
    background: linear-gradient(to right, var(--color-warm-700) var(--vol-fill, 100%), var(--color-warm-300) var(--vol-fill, 100%));
  }
  .vol-slider:hover {
    height: 4px;
  }
  :global(html.dark) .vol-slider:hover {
    background: linear-gradient(to right, var(--color-accent-500) var(--vol-fill, 100%), rgba(255, 255, 255, 0.1) var(--vol-fill, 100%));
  }
  :global(html:not(.dark)) .vol-slider:hover {
    background: linear-gradient(to right, var(--color-accent-500) var(--vol-fill, 100%), var(--color-warm-300) var(--vol-fill, 100%));
  }
  .vol-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 0;
    height: 0;
    border-radius: 50%;
    cursor: pointer;
    transition: transform 0.15s;
  }
  .vol-slider:hover::-webkit-slider-thumb {
    width: 11px;
    height: 11px;
  }
  :global(html.dark) .vol-slider::-webkit-slider-thumb {
    background: white;
  }
  :global(html:not(.dark)) .vol-slider::-webkit-slider-thumb {
    background: var(--color-warm-700);
  }
</style>
