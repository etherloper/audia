<script lang="ts">
  import { onMount, type Snippet } from "svelte";

  /**
   * A horizontal row with left/right arrow buttons instead of a scrollbar.
   * Arrows only appear when there's more to scroll in that direction.
   * Trackpad and Shift+wheel scrolling still work.
   */
  let { children, label }: { children: Snippet; label: string } = $props();

  let rowEl: HTMLDivElement | undefined = $state();
  let canLeft = $state(false);
  let canRight = $state(false);

  function update() {
    if (!rowEl) return;
    const { scrollLeft, scrollWidth, clientWidth } = rowEl;
    canLeft = scrollLeft > 2;
    canRight = scrollLeft + clientWidth < scrollWidth - 2;
  }

  /** Scroll by most of the visible width, keeping a card's worth of context. */
  function scrollByPage(direction: 1 | -1) {
    if (!rowEl) return;
    const step = Math.max(rowEl.clientWidth - 196, 196);
    rowEl.scrollBy({ left: direction * step, behavior: "smooth" });
    // Scroll events normally keep the arrows in sync; also re-check once the smooth scroll settles
    setTimeout(update, 600);
  }

  onMount(() => {
    update();
    // Re-check when the window resizes or cards are added/removed
    const resize = new ResizeObserver(update);
    if (rowEl) resize.observe(rowEl);
    const mutations = new MutationObserver(update);
    if (rowEl) mutations.observe(rowEl, { childList: true });
    return () => {
      resize.disconnect();
      mutations.disconnect();
    };
  });

  const arrowClass =
    "absolute top-[90px] z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-warm-200 bg-white text-warm-700 shadow-lg shadow-black/15 transition-all duration-200 hover:scale-105 hover:text-warm-900 active:scale-95 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:shadow-black/50 dark:hover:text-white";
</script>

<div class="relative flow-root" role="region" aria-label={label}>
  <!-- A scrolling row clips on all sides, so the padding gives the now-playing ring and hover
       shadows room; the matching negative margins keep the row's position and spacing unchanged. -->
  <div
    bind:this={rowEl}
    onscroll={update}
    class="no-scrollbar -mx-1 -my-3 flex snap-x snap-mandatory scroll-px-1 gap-4 overflow-x-auto px-1 py-3"
  >
    {@render children()}
  </div>

  {#if canLeft}
    <button onclick={() => scrollByPage(-1)} class="{arrowClass} -left-3" aria-label="Scroll {label} left" title="Previous">
      <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
    </button>
  {/if}
  {#if canRight}
    <button onclick={() => scrollByPage(1)} class="{arrowClass} -right-3" aria-label="Scroll {label} right" title="Next">
      <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </button>
  {/if}
</div>

<style>
  /* Hide the scrollbar but keep the row scrollable */
  .no-scrollbar {
    scrollbar-width: none;
  }
  .no-scrollbar::-webkit-scrollbar {
    display: none;
  }
</style>
