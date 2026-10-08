<script lang="ts">
  import { playerState } from "../../state/player.svelte";
  import { libraryState } from "../../state/library.svelte";
  import { miniPlayerState } from "../../state/miniPlayer.svelte";
  import { settingsState } from "../../state/settings.svelte";
  import { sleepTimerState } from "../../state/sleepTimer.svelte";
  import { coverSrc } from "../../utils/covers";
  import { formatDuration } from "../../utils/format";
  import { tick } from "svelte";

  // The chapter list is sized to its rows, so a short list doesn't scroll; long
  // ones stop at a maximum that leaves part of a row showing as a scroll hint.
  // These match the panel's markup: h-9 header, h-8 rows, pb-1.5, a 1px border.
  const PANEL_HEADER = 36;
  const PANEL_ROW = 32;
  const PANEL_PADDING = 6;
  const PANEL_BORDER = 1;
  const PANEL_MAX = 280;
  let chapterPanelHeight = $derived(
    Math.min(PANEL_MAX, PANEL_HEADER + playerState.currentChapters.length * PANEL_ROW + PANEL_PADDING + PANEL_BORDER),
  );

  let book = $derived(
    playerState.currentBookId !== null ? libraryState.getBook(playerState.currentBookId) : null,
  );
  let remaining = $derived(Math.max(0, playerState.duration - playerState.currentTime));

  // Scrolling over the player changes volume; show the level briefly in place of the time
  let showVolumeUntil = $state(0);
  let now = $state(Date.now());
  let showingVolume = $derived(now < showVolumeUntil);

  function flashVolume() {
    showVolumeUntil = Date.now() + 1200;
    now = Date.now();
    setTimeout(() => (now = Date.now()), 1250);
  }

  function onWheel(e: WheelEvent) {
    // Let the chapter list scroll normally
    if ((e.target as HTMLElement).closest("[data-scroll]")) return;
    e.preventDefault();
    playerState.setVolume(playerState.volume + (e.deltaY < 0 ? 0.05 : -0.05));
    flashVolume();
  }

  // Chapter list: the window grows to make room for it, away from the screen edge it's
  // against, so the player itself stays put
  let chaptersOpen = $state(false);
  let chapterListEl: HTMLDivElement | undefined = $state();
  // Chapters before the current one count as finished (all of them once the book is),
  // as on the book page
  let finishedBefore = $derived(
    playerState.currentBookId !== null && libraryState.progressMap.get(playerState.currentBookId)?.finished_at
      ? playerState.currentChapters.length
      : playerState.currentChapterIndex,
  );
  let panelBelow = $derived(miniPlayerState.corner.startsWith("top"));

  async function openChapters() {
    chaptersOpen = true;
    await miniPlayerState.setExtraHeight(chapterPanelHeight);
    await tick();
    chapterListEl
      ?.querySelector<HTMLElement>(`[data-index="${playerState.currentChapterIndex}"]`)
      ?.scrollIntoView({ block: "center" });
  }

  async function closeChapters() {
    if (!chaptersOpen) return;
    chaptersOpen = false;
    await miniPlayerState.setExtraHeight(0);
  }

  function chooseChapter(i: number) {
    if (i !== playerState.currentChapterIndex) playerState.goToChapter(i);
    closeChapters();
  }

  function expand() {
    chaptersOpen = false;
    miniPlayerState.exit();
  }

  const isControl = (e: MouseEvent) => (e.target as HTMLElement).closest("button, [data-no-drag]");

  // The whole player is a drag handle (it has no title bar). The drag is only handed
  // to the OS once the mouse actually moves — starting it on mousedown would swallow
  // the second click of a double-click.
  const DRAG_THRESHOLD = 4;
  let pressedAt: { x: number; y: number } | null = null;

  function onMouseDown(e: MouseEvent) {
    if (e.button !== 0 || isControl(e)) return;
    pressedAt = { x: e.screenX, y: e.screenY };
  }

  function onMouseMove(e: MouseEvent) {
    if (e.buttons === 0) {
      pressedAt = null;
      miniPlayerState.pointerReleased(); // ends a drag the OS was handling
      return;
    }
    if (pressedAt && Math.hypot(e.screenX - pressedAt.x, e.screenY - pressedAt.y) > DRAG_THRESHOLD) {
      pressedAt = null;
      miniPlayerState.startDrag();
    }
  }

  function onDblClick(e: MouseEvent) {
    if (!isControl(e)) expand();
  }

  // Seek bar: hover shows the time under the cursor, click jumps there
  let hoverFraction = $state<number | null>(null);

  function fractionAt(e: MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  }

  function seekFromClick(e: MouseEvent) {
    playerState.seek(fractionAt(e) * playerState.duration);
  }
</script>

<svelte:window onkeydown={(e) => { if (e.key === "Escape" && chaptersOpen) closeChapters(); }} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="flex h-screen w-screen select-none flex-col overflow-hidden bg-canvas text-warm-900 dark:text-neutral-100"
  onmousedown={onMouseDown}
  onmousemove={onMouseMove}
  onmouseup={() => (pressedAt = null)}
  ondblclick={onDblClick}
  onwheel={onWheel}
>
  {#if chaptersOpen}
    <!-- Chapter list (fills the space the window grew by) -->
    <div
      data-no-drag
      class="animate-fadeIn flex min-h-0 flex-1 flex-col border-warm-200/80 dark:border-white/[0.07] {panelBelow ? 'order-last border-t' : 'border-b'}"
    >
      <div class="flex h-9 shrink-0 items-center gap-2 pl-3.5 pr-1.5">
        <p class="text-[12px] font-semibold">Chapters</p>
        <p class="text-[11px] tabular-nums text-warm-400 dark:text-neutral-500">
          {playerState.currentChapterIndex + 1} of {playerState.currentChapters.length}
        </p>
        <div class="flex-1"></div>
        <button
          onclick={closeChapters}
          class="flex h-7 w-7 items-center justify-center rounded-md text-warm-400 transition-colors hover:bg-warm-200/60 hover:text-warm-800 dark:text-neutral-500 dark:hover:bg-white/[0.06] dark:hover:text-white"
          title="Close (Esc)"
          aria-label="Close chapters"
        >
          <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M6 18L18 6" /></svg>
        </button>
      </div>
      <div data-scroll bind:this={chapterListEl} role="menu" aria-label="Chapters" class="mini-scroll min-h-0 flex-1 overflow-y-auto px-1.5 pb-1.5">
        {#each playerState.currentChapters as chapter, i (chapter.id)}
          {@const current = i === playerState.currentChapterIndex}
          {@const done = i < finishedBefore && !current}
          <button
            role="menuitem"
            data-index={i}
            onclick={() => chooseChapter(i)}
            aria-current={current ? "true" : undefined}
            class="flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-[12.5px] transition-colors
              {current
                ? 'bg-accent-500/12 font-semibold text-accent-600 dark:bg-accent-500/[0.14] dark:text-accent-400'
                : done
                  ? 'text-warm-500 hover:bg-warm-200/50 dark:text-neutral-500 dark:hover:bg-white/[0.05]'
                  : 'text-warm-700 hover:bg-warm-200/50 dark:text-neutral-300 dark:hover:bg-white/[0.05]'}"
          >
            <span class="flex w-5 shrink-0 justify-end text-[10.5px] tabular-nums {current ? '' : done ? 'text-accent-600 dark:text-accent-400' : 'text-warm-400 dark:text-neutral-500'}">
              {#if done}
                <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.75" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
                <span class="sr-only">Finished, chapter {i + 1}</span>
              {:else if current && playerState.isPlaying}
                <span class="waveform-bars h-2.5">
                  <span class="bg-current"></span><span class="bg-current"></span><span class="bg-current"></span><span class="bg-current"></span><span class="bg-current"></span>
                </span>
              {:else}
                {i + 1}
              {/if}
            </span>
            <span class="min-w-0 flex-1 truncate">{chapter.title}</span>
            <span class="shrink-0 text-[10.5px] font-normal tabular-nums text-warm-400 dark:text-neutral-500">{formatDuration(chapter.duration_secs)}</span>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <!-- The player (always the original mini size) -->
  <div class="relative flex h-[104px] shrink-0 flex-col">
  <div class="flex min-h-0 flex-1 items-center gap-3 px-3">
    <div
      class="h-16 w-16 shrink-0 overflow-hidden rounded-md shadow-md shadow-black/20 ring-1 ring-black/5 dark:ring-white/10"
      title="Drag to move · double-click to expand"
    >
      {#if book?.cover_art}
        <img src={coverSrc(book.cover_art)} alt="" class="h-full w-full object-cover" draggable="false" />
      {:else}
        <div class="flex h-full w-full items-center justify-center bg-warm-200/60 dark:bg-white/[0.06]">
          <svg class="h-6 w-6 text-warm-400 dark:text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        </div>
      {/if}
    </div>

    <div class="min-w-0 flex-1">
      <div class="flex items-baseline justify-between gap-2">
        <p class="truncate text-[13px] font-semibold leading-tight">{book?.title ?? "Nothing playing"}</p>
        <span class="shrink-0 text-[11px] tabular-nums text-warm-500 dark:text-neutral-500">
          {#if showingVolume}
            Vol {Math.round(playerState.volume * 100)}%
          {:else}
            {#if sleepTimerState.active}
              <span title="Sleep timer">☾ {sleepTimerState.display} ·</span>
            {/if}
            -{formatDuration(remaining)}
          {/if}
        </span>
      </div>
      <p class="mt-0.5 truncate text-[11px] leading-tight text-warm-500 dark:text-neutral-500">
        {playerState.currentChapter?.title ?? ""}
      </p>

      <div class="mt-1.5 flex items-center gap-0.5">
        <button
          onclick={() => playerState.skipBackward(settingsState.skipBackSecs)}
          class="flex h-7 w-7 items-center justify-center rounded-full text-warm-600 transition-all hover:text-warm-900 active:scale-90 dark:text-neutral-300 dark:hover:text-white"
          title="Back {settingsState.skipBackSecs}s"
          aria-label="Back {settingsState.skipBackSecs} seconds"
        >
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
          </svg>
        </button>
        <button
          onclick={() => playerState.togglePlayPause()}
          class="btn-primary mx-0.5 flex h-8 w-8 items-center justify-center rounded-full hover:scale-105 active:scale-95"
          title={playerState.isPlaying ? "Pause" : "Play"}
        >
          {#if playerState.isPlaying}
            <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>
          {:else}
            <svg class="ml-0.5 h-[18px] w-[18px]" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
          {/if}
        </button>
        <button
          onclick={() => playerState.skipForward(settingsState.skipForwardSecs)}
          class="flex h-7 w-7 items-center justify-center rounded-full text-warm-600 transition-all hover:text-warm-900 active:scale-90 dark:text-neutral-300 dark:hover:text-white"
          title="Forward {settingsState.skipForwardSecs}s"
          aria-label="Forward {settingsState.skipForwardSecs} seconds"
        >
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
          </svg>
        </button>

        <div class="min-w-0 flex-1"></div>

        <!-- Volume: the slider slides out on hover; clicking the icon mutes -->
        <div data-no-drag class="group/vol flex items-center">
          <div class="flex w-0 items-center overflow-hidden opacity-0 transition-all duration-200 group-focus-within/vol:w-[42px] group-focus-within/vol:opacity-100 group-hover/vol:w-[42px] group-hover/vol:opacity-100">
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={playerState.volume}
              oninput={(e) => {
                playerState.setVolume(parseFloat((e.target as HTMLInputElement).value));
                flashVolume();
              }}
              aria-label="Volume"
              aria-valuetext="{Math.round(playerState.volume * 100)}%"
              class="mini-vol ml-1 w-[36px]"
              style="--vol-fill: {playerState.volume * 100}%"
            />
          </div>
          <button
            onclick={() => playerState.toggleMute()}
            class="flex h-7 w-7 items-center justify-center rounded-md text-warm-400 transition-colors hover:text-warm-800 dark:text-neutral-500 dark:hover:text-white"
            title={playerState.volume > 0 ? "Mute" : "Unmute"}
            aria-label={playerState.volume > 0 ? "Mute" : "Unmute"}
          >
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              {#if playerState.volume === 0}
                <path d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              {:else if playerState.volume < 0.5}
                <path d="M15.536 8.464a5 5 0 010 7.072" />
              {:else}
                <path d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728" />
              {/if}
            </svg>
          </button>
        </div>

        {#if playerState.currentChapters.length > 1}
          <button
            onclick={() => (chaptersOpen ? closeChapters() : openChapters())}
            aria-expanded={chaptersOpen}
            class="flex h-7 w-7 items-center justify-center rounded-md transition-colors
              {chaptersOpen
                ? 'bg-warm-200/60 text-warm-800 dark:bg-white/[0.08] dark:text-white'
                : 'text-warm-400 hover:text-warm-800 dark:text-neutral-500 dark:hover:text-white'}"
            title="Chapters"
            aria-label="Chapters"
          >
            <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M9 6h11M9 12h11M9 18h11" />
              <circle cx="4.5" cy="6" r="1" fill="currentColor" />
              <circle cx="4.5" cy="12" r="1" fill="currentColor" />
              <circle cx="4.5" cy="18" r="1" fill="currentColor" />
            </svg>
          </button>
        {/if}
        <button
          onclick={() => miniPlayerState.setAlwaysOnTop(!settingsState.miniAlwaysOnTop)}
          aria-pressed={settingsState.miniAlwaysOnTop}
          class="flex h-7 w-7 items-center justify-center rounded-md transition-colors
            {settingsState.miniAlwaysOnTop
              ? 'text-accent-600 dark:text-accent-400'
              : 'text-warm-400 hover:text-warm-800 dark:text-neutral-500 dark:hover:text-white'}"
          title={settingsState.miniAlwaysOnTop ? "Always on top: on" : "Always on top: off"}
        >
          <!-- Pin -->
          <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill={settingsState.miniAlwaysOnTop ? "currentColor" : "none"} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 17v5" />
            <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
          </svg>
        </button>
        <button
          onclick={expand}
          class="flex h-7 w-7 items-center justify-center rounded-md text-warm-400 transition-colors hover:text-warm-800 dark:text-neutral-500 dark:hover:text-white"
          title="Expand (Ctrl+Shift+M)"
          aria-label="Expand to full window"
        >
          <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" />
          </svg>
        </button>
      </div>
    </div>
  </div>

  <!-- Chapter progress; click to seek -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    data-no-drag
    role="slider"
    tabindex="-1"
    aria-label="Chapter progress"
    aria-valuemin={0}
    aria-valuemax={Math.round(playerState.duration)}
    aria-valuenow={Math.round(playerState.currentTime)}
    class="group h-2 shrink-0 cursor-pointer"
    onclick={seekFromClick}
    onmousemove={(e) => (hoverFraction = fractionAt(e))}
    onmouseleave={() => (hoverFraction = null)}
  >
    <div class="mt-1 h-1 w-full bg-warm-200/70 transition-all group-hover:mt-0 group-hover:h-2 dark:bg-white/[0.08]">
      <div class="h-full bg-accent-500" style="width: {playerState.progressPercent}%"></div>
    </div>
  </div>

  {#if hoverFraction !== null && playerState.duration > 0}
    <span
      class="tooltip-surface pointer-events-none absolute bottom-3 -translate-x-1/2 rounded px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums"
      style="left: clamp(24px, {hoverFraction * 100}%, calc(100% - 24px))"
    >
      {formatDuration(hoverFraction * playerState.duration)}
    </span>
  {/if}
  </div>
</div>

<style>
  .mini-vol {
    height: 4px;
    appearance: none;
    -webkit-appearance: none;
    border-radius: 2px;
    outline: none;
    cursor: pointer;
    background: linear-gradient(to right, var(--color-accent-500) var(--vol-fill), var(--color-warm-300) var(--vol-fill));
  }
  :global(html.dark) .mini-vol {
    background: linear-gradient(to right, var(--color-accent-500) var(--vol-fill), rgb(255 255 255 / 0.12) var(--vol-fill));
  }
  .mini-vol::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--color-accent-500);
  }
  /* Slim scrollbar for the chapter list */
  .mini-scroll::-webkit-scrollbar {
    width: 6px;
  }
  .mini-scroll::-webkit-scrollbar-thumb {
    border-radius: 9999px;
    background: rgb(0 0 0 / 0.15);
  }
  :global(html.dark) .mini-scroll::-webkit-scrollbar-thumb {
    background: rgb(255 255 255 / 0.12);
  }
</style>
