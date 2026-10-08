<script lang="ts">
  import { uiState } from "../../state/ui.svelte";
</script>

<button
  onclick={() => uiState.toggleTheme()}
  class="flex h-9 w-9 items-center justify-center rounded-xl transition-colors hover:bg-warm-200/80 dark:hover:bg-neutral-800/80"
  title="Toggle theme"
>
  {#if uiState.theme === "dark"}
    <svg class="h-[18px] w-[18px] text-warm-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  {:else}
    <svg class="h-[18px] w-[18px] text-warm-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
  {/if}
</button>
