<script lang="ts">
  import { onMount } from "svelte";
  import { portal } from "../../utils/portal";
  import type { MenuItem } from "../../utils/bookMenu";
  import { menuKeys } from "../../utils/menuKeys";

  let {
    x,
    y,
    items,
    onclose,
  }: {
    x: number;
    y: number;
    items: MenuItem[];
    onclose: () => void;
  } = $props();

  let menuEl: HTMLDivElement | undefined = $state();

  onMount(() => {
    function handleClick(e: MouseEvent) {
      if (menuEl && !menuEl.contains(e.target as Node)) {
        onclose();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onclose();
    }
    // Focus the menu so ↑/↓ work straight away
    menuEl?.focus({ preventScroll: true });
    window.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleKey);
    };
  });

  // Adjust position to stay within viewport
  let adjustedX = $derived.by(() => {
    if (typeof window === "undefined") return x;
    return Math.min(x, window.innerWidth - 200);
  });
  let adjustedY = $derived.by(() => {
    if (typeof window === "undefined") return y;
    return Math.min(y, window.innerHeight - items.length * 36 - 16);
  });
</script>

<!-- Portalled to <body> so the card it's opened from can't offset or clip it -->
<div
  use:portal
  use:menuKeys={onclose}
  bind:this={menuEl}
  role="menu"
  tabindex="-1"
  class="outline-none menu-surface animate-scaleIn fixed z-50 min-w-[180px] overflow-hidden rounded-xl border py-1 shadow-xl shadow-black/10 dark:shadow-black/40"
  style="left: {adjustedX}px; top: {adjustedY}px"
>
  {#each items as item}
    <button
      role="menuitem"
      onclick={() => { item.action(); onclose(); }}
      class="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] outline-none transition-all duration-150
        {item.danger
          ? 'text-red-600 hover:bg-red-50/80 focus-visible:bg-red-50/80 dark:text-red-400 dark:hover:bg-red-500/10 dark:focus-visible:bg-red-500/10'
          : 'text-warm-700 hover:bg-warm-100/80 focus-visible:bg-warm-100/80 dark:text-neutral-200 dark:hover:bg-white/[0.06] dark:focus-visible:bg-white/[0.06]'}"
    >
      {#if item.icon === "play"}
        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
      {:else if item.icon === "details"}
        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
      {:else if item.icon === "heart"}
        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
      {:else if item.icon === "heart-filled"}
        <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
      {:else if item.icon === "edit"}
        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
      {:else if item.icon === "check"}
        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
      {:else if item.icon === "trash"}
        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
      {:else if item.icon === "reset"}
        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
      {/if}
      {item.label}
    </button>
  {/each}
</div>
