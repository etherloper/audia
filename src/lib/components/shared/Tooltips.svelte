<script lang="ts">
  import { onMount } from "svelte";
  import { splitShortcut } from "../../utils/tooltip";

  /**
   * App-wide tooltips. Any element with a `title` gets a styled tooltip instead of
   * the native one: on hover the title is moved aside (so Windows doesn't show its
   * own) and put back on leave, so it still names the element for screen readers
   * and components can keep setting `title` as usual. Inside an element marked
   * data-tooltip-side="right" (the sidebar) it appears to the right instead.
   */

  const SHOW_DELAY_MS = 450;
  /** Moving straight from one tooltip to the next shows it at once. */
  const WARM_MS = 400;
  const GAP = 6;
  const EDGE = 6;

  let tip = $state<{ text: string; shortcut: string | null } | null>(null);
  let pos = $state({ left: 0, top: 0, placed: false });
  let tipEl: HTMLDivElement | undefined = $state();

  let target: HTMLElement | null = null;
  let savedTitle = "";
  let showTimer: ReturnType<typeof setTimeout> | null = null;
  let lastHiddenAt = 0;

  function restoreTitle() {
    // Leave it alone if the component set a new title while we were showing ours
    if (target && !target.hasAttribute("title") && savedTitle) target.setAttribute("title", savedTitle);
  }

  function hide() {
    if (showTimer) clearTimeout(showTimer);
    showTimer = null;
    restoreTitle();
    if (tip) lastHiddenAt = Date.now();
    target = null;
    tip = null;
  }

  async function place() {
    if (!target || !tipEl) return;
    const anchor = target.getBoundingClientRect();
    const { width, height } = tipEl.getBoundingClientRect();
    const clampX = (x: number) => Math.min(Math.max(x, EDGE), window.innerWidth - width - EDGE);
    const clampY = (y: number) => Math.min(Math.max(y, EDGE), window.innerHeight - height - EDGE);
    if (target.closest("[data-tooltip-side='right']")) {
      // Beside the element (the sidebar), so it doesn't cover the items above
      pos = { left: clampX(anchor.right + GAP), top: clampY(anchor.top + anchor.height / 2 - height / 2), placed: true };
      return;
    }
    // Above the element, or below when there's no room (e.g. the window controls)
    let top = anchor.top - height - GAP;
    if (top < EDGE) top = anchor.bottom + GAP;
    pos = { left: clampX(anchor.left + anchor.width / 2 - width / 2), top, placed: true };
  }

  function show(el: HTMLElement, text: string) {
    const [label, shortcut] = splitShortcut(text);
    pos = { left: 0, top: 0, placed: false };
    tip = { text: label, shortcut };
    // Measure once rendered, then position
    requestAnimationFrame(place);
    queueMicrotask(place);
  }

  function onOver(e: MouseEvent) {
    const el = (e.target as Element | null)?.closest<HTMLElement>("[title]");
    if (!el || el === target) return;
    const text = el.getAttribute("title")?.trim() ?? "";
    hide();
    if (!text) return;
    target = el;
    savedTitle = text;
    el.removeAttribute("title");
    const delay = Date.now() - lastHiddenAt < WARM_MS ? 0 : SHOW_DELAY_MS;
    showTimer = setTimeout(() => {
      if (target === el && el.isConnected) show(el, text);
    }, delay);
  }

  function onOut(e: MouseEvent) {
    if (!target) return;
    const to = e.relatedTarget as Node | null;
    if (to && target.contains(to)) return;
    hide();
  }

  onMount(() => {
    const opts = { capture: true, passive: true } as const;
    document.addEventListener("mouseover", onOver, opts);
    document.addEventListener("mouseout", onOut, opts);
    // Clicking, typing or scrolling dismisses it, like native tooltips
    document.addEventListener("mousedown", hide, opts);
    document.addEventListener("keydown", hide, opts);
    document.addEventListener("scroll", hide, opts);
    window.addEventListener("blur", hide);
    return () => {
      hide();
      document.removeEventListener("mouseover", onOver, opts);
      document.removeEventListener("mouseout", onOut, opts);
      document.removeEventListener("mousedown", hide, opts);
      document.removeEventListener("keydown", hide, opts);
      document.removeEventListener("scroll", hide, opts);
      window.removeEventListener("blur", hide);
    };
  });

  // If the element goes away while hovered (e.g. a menu closes), drop the tooltip
  $effect(() => {
    if (!tip) return;
    const timer = setInterval(() => {
      if (target && !target.isConnected) hide();
    }, 250);
    return () => clearInterval(timer);
  });
</script>

{#if tip}
  <div
    bind:this={tipEl}
    role="tooltip"
    class="tooltip pointer-events-none fixed z-[100] flex max-w-[280px] items-center gap-1.5 tooltip-surface rounded-md px-2 py-1 text-[11.5px] font-medium leading-snug"
    class:placed={pos.placed}
    style="left: {pos.left}px; top: {pos.top}px"
  >
    <span>{tip.text}</span>
    {#if tip.shortcut}
      <kbd class="shrink-0 rounded border border-warm-200 bg-warm-50 px-1 font-sans text-[10px] font-semibold text-warm-500 dark:border-white/15 dark:bg-white/[0.06] dark:text-neutral-400">{tip.shortcut}</kbd>
    {/if}
  </div>
{/if}

<style>
  /* Hidden until measured and placed, then a quick fade in */
  .tooltip {
    opacity: 0;
  }
  .tooltip.placed {
    opacity: 1;
    transition: opacity 0.12s ease-out;
  }
</style>
