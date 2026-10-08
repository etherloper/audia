<script lang="ts">
  import { uiState } from "../../state/ui.svelte";
  import { libraryState } from "../../state/library.svelte";
  import { openQuickSearch } from "../shared/QuickSearch.svelte";

  let collapsed = $derived(uiState.sidebarCollapsed);
</script>

<aside
  data-tooltip-side="right"
  class="chrome flex shrink-0 flex-col border-r transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
    {collapsed ? 'w-[52px]' : 'w-56'}"
>
  <!-- App title + collapse toggle -->
  <div class="flex h-11 items-center border-b border-warm-200/50 dark:border-white/[0.08] {collapsed ? 'justify-center px-2' : 'justify-between px-4'}" data-tauri-drag-region>
    {#if !collapsed}
      <span class="text-[15px] uppercase tracking-[0.15em] text-warm-700 dark:text-neutral-300 transition-opacity duration-200" style="font-family: 'Zen Dots', cursive;">Audia</span>
    {:else}
      <span class="text-[14px] uppercase tracking-[0.15em] text-warm-700 dark:text-neutral-300" style="font-family: 'Zen Dots', cursive;">A</span>
    {/if}
    {#if !collapsed}
      <button
        onclick={() => uiState.toggleSidebar()}
        class="flex h-6 w-6 items-center justify-center rounded-md text-warm-400 transition-all duration-200 hover:text-warm-700 hover:bg-warm-800/5 active:scale-90 dark:text-neutral-500 dark:hover:text-white dark:hover:bg-white/5"
        title="Collapse sidebar"
      >
        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="9" y1="3" x2="9" y2="21" />
        </svg>
      </button>
    {/if}
  </div>

  <!-- Navigation -->
  <nav class="flex-1 space-y-0.5 px-2 pt-3">
    <!-- Quick search (opens the Ctrl+K palette) -->
    <button
      onclick={openQuickSearch}
      class="mb-2 flex w-full items-center gap-2.5 rounded-lg text-[13px] transition-all duration-200 active:scale-[0.97]
        {collapsed
          ? 'justify-center px-2.5 py-2 text-warm-500 hover:bg-warm-800/5 hover:text-warm-800 dark:text-neutral-400 dark:hover:bg-white/5 dark:hover:text-white'
          : 'border border-warm-200/80 px-2.5 py-1.5 text-warm-400 hover:border-warm-300 hover:text-warm-700 dark:border-white/[0.08] dark:text-neutral-500 dark:hover:border-white/15 dark:hover:text-neutral-300'}"
      title="Search (Ctrl+K)"
      aria-label="Search"
    >
      <svg class="shrink-0 {collapsed ? 'h-[18px] w-[18px]' : 'h-4 w-4'}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
        <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z" />
      </svg>
      {#if !collapsed}
        <span class="flex-1 text-left">Search</span>
        <kbd class="rounded border border-warm-200 px-1 text-[10px] dark:border-neutral-700">Ctrl K</kbd>
      {/if}
    </button>
    <button
      onclick={() => uiState.navigateToHome()}
      class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-all duration-200
        {collapsed ? 'justify-center' : ''}
        {uiState.currentView === 'home'
          ? 'bg-warm-800/8 text-warm-800 shadow-[0_1px_3px_rgba(0,0,0,0.04)] dark:bg-white/[0.08] dark:text-white dark:shadow-[0_1px_3px_rgba(0,0,0,0.2)]'
          : 'text-warm-500 hover:text-warm-800 hover:bg-warm-800/5 active:scale-[0.97] dark:text-neutral-400 dark:hover:text-white dark:hover:bg-white/5'}"
      title={collapsed ? "Home" : ""}
    >
      <svg class="h-[18px] w-[18px] shrink-0 transition-transform duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
        <path stroke-linecap="round" stroke-linejoin="round" d="M3 12l9-9 9 9M5 10v10a1 1 0 001 1h3a1 1 0 001-1v-5a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 001 1h3a1 1 0 001-1V10" />
      </svg>
      {#if !collapsed}
        <span>Home</span>
      {/if}
    </button>

    <button
      onclick={() => uiState.navigateToLibrary()}
      class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-all duration-200
        {collapsed ? 'justify-center' : ''}
        {uiState.currentView === 'library'
          ? 'bg-warm-800/8 text-warm-800 shadow-[0_1px_3px_rgba(0,0,0,0.04)] dark:bg-white/[0.08] dark:text-white dark:shadow-[0_1px_3px_rgba(0,0,0,0.2)]'
          : 'text-warm-500 hover:text-warm-800 hover:bg-warm-800/5 active:scale-[0.97] dark:text-neutral-400 dark:hover:text-white dark:hover:bg-white/5'}"
      title={collapsed ? "Library" : ""}
    >
      <svg class="h-[18px] w-[18px] shrink-0 transition-transform duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
        <path stroke-linecap="round" stroke-linejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
      {#if !collapsed}
        <span>Library</span>
      {/if}
    </button>

    <button
      onclick={() => uiState.navigateToStats()}
      class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-all duration-200
        {collapsed ? 'justify-center' : ''}
        {uiState.currentView === 'stats'
          ? 'bg-warm-800/8 text-warm-800 shadow-[0_1px_3px_rgba(0,0,0,0.04)] dark:bg-white/[0.08] dark:text-white dark:shadow-[0_1px_3px_rgba(0,0,0,0.2)]'
          : 'text-warm-500 hover:text-warm-800 hover:bg-warm-800/5 active:scale-[0.97] dark:text-neutral-400 dark:hover:text-white dark:hover:bg-white/5'}"
      title={collapsed ? "Stats" : ""}
    >
      <svg class="h-[18px] w-[18px] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
      {#if !collapsed}
        <span>Stats</span>
      {/if}
    </button>
  </nav>

  <!-- Bottom section -->
  <div class="space-y-0.5 px-2 pb-3">
    {#if collapsed}
      <button
        onclick={() => uiState.toggleSidebar()}
        class="flex w-full items-center justify-center rounded-lg px-2.5 py-2 text-warm-400 transition-all duration-200 hover:text-warm-700 hover:bg-warm-800/5 active:scale-90 dark:text-neutral-500 dark:hover:text-white dark:hover:bg-white/5"
        title="Expand sidebar"
      >
        <svg class="h-[18px] w-[18px] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="9" y1="3" x2="9" y2="21" />
        </svg>
      </button>
    {/if}

    <!-- Settings -->
    <button
      onclick={() => uiState.navigateToSettings()}
      class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-all duration-200
        {collapsed ? 'justify-center' : ''}
        {uiState.currentView === 'settings'
          ? 'bg-warm-800/8 text-warm-800 shadow-[0_1px_3px_rgba(0,0,0,0.04)] dark:bg-white/[0.08] dark:text-white dark:shadow-[0_1px_3px_rgba(0,0,0,0.2)]'
          : 'text-warm-400 hover:text-warm-700 hover:bg-warm-800/5 active:scale-[0.97] dark:text-neutral-500 dark:hover:text-white dark:hover:bg-white/5'}"
      title={collapsed ? "Settings" : ""}
    >
      <svg class="h-[18px] w-[18px] shrink-0 transition-transform duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
        <path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
      {#if !collapsed}
        <span>Settings</span>
      {/if}
    </button>
  </div>

  <!-- Footer -->
  {#if !collapsed}
    <div class="border-t border-warm-200/50 px-4 py-2.5 dark:border-white/[0.08]">
      <p class="text-[11px] text-warm-400 dark:text-neutral-600" aria-live="polite">
        {#if libraryState.loaded}
          {libraryState.books.length} {libraryState.books.length === 1 ? "book" : "books"}
        {:else}
          Loading library…
        {/if}
      </p>
    </div>
  {/if}
</aside>
