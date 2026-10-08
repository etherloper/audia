<script lang="ts">
  import { fade, fly } from "svelte/transition";
  import { uiState } from "../../state/ui.svelte";
  import { playerState } from "../../state/player.svelte";

  /**
   * The notification in the bottom-right corner, above the player bar (or lower
   * when nothing's loaded). One at a time; a new one replaces the last.
   */

  const reduceMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const inDuration = reduceMotion ? 0 : 220;
  const outDuration = reduceMotion ? 0 : 150;

  function runAction() {
    const action = uiState.toast?.action;
    uiState.dismissToast();
    action?.run();
  }
</script>

{#if uiState.toast}
  {@const toast = uiState.toast}
  {#key toast.id}
    <div
      role={toast.kind === "error" ? "alert" : "status"}
      in:fly={{ x: 24, duration: inDuration }}
      out:fade={{ duration: outDuration }}
      class="menu-surface fixed right-5 z-[60] w-[340px] max-w-[calc(100vw-40px)] overflow-hidden rounded-xl border shadow-xl shadow-black/10 dark:shadow-black/50
        {playerState.currentBookId !== null ? 'bottom-24' : 'bottom-5'}"
    >
      <div class="flex items-start gap-3 py-3 pl-3.5 pr-2">
        <!-- Type icon -->
        <span
          class="mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-full
            {toast.kind === 'error'
              ? 'bg-red-500/12 text-red-600 dark:text-red-400'
              : toast.kind === 'success'
                ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400'
                : 'bg-warm-200/70 text-warm-700 dark:bg-white/[0.08] dark:text-neutral-300'}"
          aria-hidden="true"
        >
          {#if toast.kind === "error"}
            <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" d="M12 7v6m0 4h.01" /></svg>
          {:else if toast.kind === "success"}
            <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.75"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
          {:else}
            <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" d="M12 11v6m0-10h.01" /></svg>
          {/if}
        </span>

        <p class="min-w-0 flex-1 pt-[3px] text-[13px] leading-snug text-warm-800 [overflow-wrap:anywhere] dark:text-neutral-100">{toast.message}</p>

        {#if toast.action}
          <button
            onclick={runAction}
            class="btn-primary mt-px shrink-0 rounded-md px-2.5 py-1 text-[12px] font-semibold"
          >
            {toast.action.label}
          </button>
        {/if}

        <button
          onclick={() => uiState.dismissToast()}
          class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-warm-400 transition-colors hover:bg-warm-100 hover:text-warm-800 dark:text-neutral-500 dark:hover:bg-white/[0.08] dark:hover:text-white"
          aria-label="Dismiss"
          title="Dismiss"
        >
          <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.25"><path stroke-linecap="round" d="M6 6l12 12M6 18L18 6" /></svg>
        </button>
      </div>

      {#if toast.action}
        <!-- How long the action (e.g. Undo) is still available -->
        <div
          class="toast-countdown absolute bottom-0 left-0 h-[2px] w-full origin-left bg-accent-500/70"
          style="animation-duration: {toast.durationMs}ms"
          aria-hidden="true"
        ></div>
      {/if}
    </div>
  {/key}
{/if}
