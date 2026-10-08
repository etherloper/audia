<script lang="ts">
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { libraryState } from "../../state/library.svelte";
  import { uiState } from "../../state/ui.svelte";

  // Null when running in a plain browser (vite dev without the Tauri shell)
  const appWindow = "__TAURI_INTERNALS__" in window ? getCurrentWindow() : null;

  function minimize() {
    appWindow?.minimize();
  }
  function toggleMaximize() {
    appWindow?.toggleMaximize();
  }
  function close() {
    appWindow?.close();
  }

  function handleDrag(e: MouseEvent) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, select, input, a")) return;
    e.preventDefault();
    appWindow?.startDragging();
  }

  function handleDblClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest("button, select, input, a")) return;
    appWindow?.toggleMaximize();
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<header
  onmousedown={handleDrag}
  ondblclick={handleDblClick}
  class="relative flex h-11 shrink-0 items-center gap-3 border-b border-warm-200/50 px-4 dark:border-white/[0.06]"
>
  <div class="flex flex-1 items-center gap-3">
    {#if uiState.currentView === "book" || uiState.currentView === "settings"}
      <button
        onclick={() => uiState.navigateToLibrary()}
        class="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[13px] text-warm-500 transition-all duration-200 hover:text-warm-800 hover:bg-warm-100/60 active:scale-[0.96] dark:text-neutral-500 dark:hover:text-white dark:hover:bg-white/[0.06]"
      >
        <svg class="h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Library
      </button>
    {/if}

    <div class="flex-1"></div>
  </div>

  <!-- Window controls: full-height tiles flush with the window edge, like native Windows
       controls. Raised above modal overlays (z-50) so they stay visible and usable. -->
  <div class="relative z-[60] -mr-4 flex items-stretch self-stretch">
    <button
      onclick={minimize}
      class="flex w-[46px] items-center justify-center text-warm-400 transition-colors duration-150 hover:bg-warm-200/60 hover:text-warm-800 active:bg-warm-300/60 dark:text-neutral-500 dark:hover:bg-white/[0.08] dark:hover:text-white dark:active:bg-white/[0.04]"
      title="Minimize"
    >
      <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" d="M5 12h14" />
      </svg>
    </button>
    <button
      onclick={toggleMaximize}
      class="flex w-[46px] items-center justify-center text-warm-400 transition-colors duration-150 hover:bg-warm-200/60 hover:text-warm-800 active:bg-warm-300/60 dark:text-neutral-500 dark:hover:bg-white/[0.08] dark:hover:text-white dark:active:bg-white/[0.04]"
      title="Maximize"
    >
      <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
        <rect x="4" y="4" width="16" height="16" rx="2" />
      </svg>
    </button>
    <button
      onclick={close}
      class="flex w-[46px] items-center justify-center text-warm-400 transition-colors duration-150 hover:bg-[#c42b1c] hover:text-white active:bg-[#c42b1c]/80 dark:text-neutral-500 dark:hover:bg-[#c42b1c] dark:hover:text-white dark:active:bg-[#c42b1c]/80"
      title="Close"
    >
      <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
        <path stroke-linecap="round" d="M6 6l12 12M6 18L18 6" />
      </svg>
    </button>
  </div>
</header>
