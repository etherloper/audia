<script lang="ts">
  import { onMount } from "svelte";
  import { sleepTimerState } from "../../state/sleepTimer.svelte";

  let showMenu = $state(false);
  let menuEl: HTMLDivElement | undefined = $state();

  const presets = [
    { label: "15 minutes", minutes: 15 },
    { label: "30 minutes", minutes: 30 },
    { label: "45 minutes", minutes: 45 },
    { label: "1 hour", minutes: 60 },
    { label: "1.5 hours", minutes: 90 },
    { label: "2 hours", minutes: 120 },
  ];

  onMount(() => {
    function handleClickOutside(e: MouseEvent) {
      if (showMenu && menuEl && !menuEl.contains(e.target as Node)) {
        showMenu = false;
      }
    }
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  });

  let mode = $derived(sleepTimerState.mode);
  let isActive = $derived(sleepTimerState.active);

  function choose(action: () => void) {
    action();
    showMenu = false;
  }
</script>

<div class="relative" bind:this={menuEl}>
  <button
    onclick={() => (showMenu = !showMenu)}
    class="relative flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-200
      {isActive
        ? 'text-warm-800 bg-warm-200/50 dark:text-white dark:bg-white/[0.08]'
        : 'text-warm-400 hover:text-warm-800 hover:bg-warm-200/40 active:scale-90 dark:text-neutral-500 dark:hover:text-white dark:hover:bg-white/[0.06]'}"
    title={isActive ? `Sleep: ${sleepTimerState.display}` : "Sleep timer"}
  >
    <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
    {#if isActive}
      <span class="absolute -top-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-warm-700 px-0.5 text-[8px] font-bold text-white dark:bg-white dark:text-black">
        {sleepTimerState.display}
      </span>
    {/if}
  </button>

  {#if showMenu}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="menu-surface animate-scaleIn absolute bottom-full right-0 mb-2 w-48 overflow-hidden rounded-xl border py-1.5 shadow-xl shadow-black/10 dark:shadow-black/40"
      onmousedown={(e) => e.stopPropagation()}
      onclick={(e) => e.stopPropagation()}
    >
      <p class="px-3.5 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-warm-400 dark:text-neutral-500">Sleep timer</p>

      {#if mode.kind === "timed"}
        <!-- Quick extend while a timer is running -->
        <button
          onclick={() => choose(() => sleepTimerState.extend())}
          class="flex w-full items-center justify-between px-3.5 py-2 text-left text-[13px] font-medium text-warm-800 transition-all duration-150 hover:bg-warm-100/80 dark:text-white dark:hover:bg-white/[0.05]"
        >
          <span>+5 minutes</span>
          <span class="text-[11px] tabular-nums text-warm-400 dark:text-neutral-500">{sleepTimerState.display} left</span>
        </button>
        <div class="mx-3 my-1 border-t border-warm-200/60 dark:border-white/[0.06]"></div>
      {/if}

      <button
        onclick={() => choose(() => sleepTimerState.startChapterEnd())}
        class="flex w-full items-center justify-between px-3.5 py-2 text-left text-[13px] font-medium transition-all duration-150 hover:bg-warm-100/80 dark:hover:bg-white/[0.05]
          {mode.kind === 'chapterEnd' ? 'text-warm-800 dark:text-white' : 'text-warm-600 dark:text-neutral-300'}"
      >
        <span>End of chapter</span>
        {#if mode.kind === "chapterEnd"}
          <svg class="h-3.5 w-3.5 text-warm-800 dark:text-white" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
          </svg>
        {/if}
      </button>

      <div class="mx-3 my-1 border-t border-warm-200/60 dark:border-white/[0.06]"></div>

      {#each presets as preset}
        {@const selected = mode.kind === "timed" && mode.minutes === preset.minutes}
        <button
          onclick={() => choose(() => sleepTimerState.start(preset.minutes))}
          class="flex w-full items-center justify-between px-3.5 py-2 text-left text-[13px] font-medium transition-all duration-150 hover:bg-warm-100/80 dark:hover:bg-white/[0.05]
            {selected ? 'text-warm-800 dark:text-white' : 'text-warm-600 dark:text-neutral-300'}"
        >
          <span>{preset.label}</span>
          {#if selected}
            <svg class="h-3.5 w-3.5 text-warm-800 dark:text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
            </svg>
          {/if}
        </button>
      {/each}
      {#if isActive}
        <div class="mx-3 my-1.5 border-t border-warm-200/60 dark:border-white/[0.06]"></div>
        <button
          onclick={() => choose(() => sleepTimerState.cancel())}
          class="flex w-full items-center gap-2 px-3.5 py-2 text-left text-[13px] font-medium text-red-500 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
        >
          <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
          Cancel timer
        </button>
      {/if}
    </div>
  {/if}
</div>
