<script lang="ts">
  import { onMount, tick } from "svelte";
  import { playerState } from "../../state/player.svelte";
  import { formatDuration } from "../../utils/format";
  import { libraryState } from "../../state/library.svelte";

  let open = $state(false);

  // Chapters before the current one count as finished (all of them once the book
  // is), as on the book page
  let finishedBefore = $derived(
    playerState.currentBookId !== null && libraryState.progressMap.get(playerState.currentBookId)?.finished_at
      ? playerState.currentChapters.length
      : playerState.currentChapterIndex,
  );
  let rootEl: HTMLDivElement | undefined = $state();
  let listEl: HTMLDivElement | undefined = $state();

  onMount(() => {
    function onMouseDown(e: MouseEvent) {
      if (open && rootEl && !rootEl.contains(e.target as Node)) open = false;
    }
    function onKey(e: KeyboardEvent) {
      if (open && e.key === "Escape") {
        e.stopPropagation();
        open = false;
      }
    }
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKey, true);
    };
  });

  async function toggle() {
    open = !open;
    if (!open) return;
    // Bring the current chapter into view
    await tick();
    listEl
      ?.querySelector<HTMLElement>(`[data-index="${playerState.currentChapterIndex}"]`)
      ?.scrollIntoView({ block: "center" });
  }

  function choose(i: number) {
    open = false;
    if (i !== playerState.currentChapterIndex) playerState.goToChapter(i);
  }
</script>

{#if playerState.currentChapters.length > 1}
  <div class="relative" bind:this={rootEl}>
    <button
      onclick={toggle}
      aria-haspopup="menu"
      aria-expanded={open}
      class="flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-200 active:scale-90
        {open
          ? 'bg-warm-200/50 text-warm-800 dark:bg-white/[0.08] dark:text-white'
          : 'text-warm-400 hover:bg-warm-200/40 hover:text-warm-800 dark:text-neutral-500 dark:hover:bg-white/[0.06] dark:hover:text-white'}"
      title="Chapters"
      aria-label="Chapters"
    >
      <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M9 6h11M9 12h11M9 18h11" />
        <circle cx="4.5" cy="6" r="1" fill="currentColor" />
        <circle cx="4.5" cy="12" r="1" fill="currentColor" />
        <circle cx="4.5" cy="18" r="1" fill="currentColor" />
      </svg>
    </button>

    {#if open}
      <div
        role="menu"
        aria-label="Chapters"
        class="menu-surface animate-scaleIn absolute bottom-full right-0 mb-2 flex max-h-[min(420px,60vh)] w-80 flex-col overflow-hidden rounded-xl border shadow-xl shadow-black/10 dark:shadow-black/40"
      >
        <p class="shrink-0 px-3.5 pt-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-warm-400 dark:text-neutral-500">
          Chapters &middot; {playerState.currentChapterIndex + 1} of {playerState.currentChapters.length}
        </p>
        <div class="min-h-0 flex-1 overflow-y-auto pb-1.5" bind:this={listEl}>
          {#each playerState.currentChapters as chapter, i (chapter.id)}
            {@const current = i === playerState.currentChapterIndex}
            {@const done = i < finishedBefore && !current}
            <button
              role="menuitem"
              data-index={i}
              onclick={() => choose(i)}
              aria-current={current ? "true" : undefined}
              class="flex w-full items-center gap-2.5 px-3.5 py-1.5 text-left text-[13px] transition-colors hover:bg-warm-100 dark:hover:bg-white/[0.06]
                {current ? 'font-semibold text-accent-600 dark:text-accent-400' : done ? 'text-warm-500 dark:text-neutral-500' : 'text-warm-700 dark:text-neutral-300'}"
            >
              <span class="flex w-6 shrink-0 justify-end text-[11px] tabular-nums {current ? '' : done ? 'text-accent-600 dark:text-accent-400' : 'text-warm-400 dark:text-neutral-500'}">
                {#if done}
                  <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.75" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
                  <span class="sr-only">Finished, chapter {i + 1}</span>
                {:else}
                  {i + 1}
                {/if}
              </span>
              <span class="min-w-0 flex-1 truncate">{chapter.title}</span>
              <span class="shrink-0 text-[11px] tabular-nums font-normal text-warm-400 dark:text-neutral-500">{formatDuration(chapter.duration_secs)}</span>
            </button>
          {/each}
        </div>
      </div>
    {/if}
  </div>
{/if}
