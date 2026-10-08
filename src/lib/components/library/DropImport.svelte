<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { listen } from "@tauri-apps/api/event";
  import { getCurrentWebview } from "@tauri-apps/api/webview";
  import { libraryState } from "../../state/library.svelte";
  import { uiState } from "../../state/ui.svelte";
  import { formatBytes } from "../../utils/format";

  interface ImportPlan {
    items: { name: string; bytes: number }[];
    total_bytes: number;
    has_items_in_library: boolean;
    skipped: { path: string; reason: string }[];
  }

  interface Progress {
    copied_bytes: number;
    total_bytes: number;
    current: string;
  }

  let dragging = $state(false);
  let pending = $state<{ paths: string[]; plan: ImportPlan } | null>(null);
  let progress = $state<Progress | null>(null);
  let copying = $state(false);
  let cancelling = $state(false);

  let progressPct = $derived(
    progress && progress.total_bytes > 0 ? Math.min(100, (progress.copied_bytes / progress.total_bytes) * 100) : 0,
  );

  const fileName = (p: string) => p.split(/[\\/]/).pop() ?? p;

  onMount(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    const unlisteners: Promise<() => void>[] = [
      getCurrentWebview().onDragDropEvent((event) => {
        const payload = event.payload;
        if (payload.type === "enter") {
          dragging = payload.paths.length > 0;
        } else if (payload.type === "leave") {
          dragging = false;
        } else if (payload.type === "drop") {
          dragging = false;
          if (payload.paths.length > 0) handleDrop(payload.paths);
        }
      }),
      listen<Progress>("library-import-progress", (event) => {
        if (copying) progress = event.payload;
      }),
    ];
    return () => unlisteners.forEach((u) => u.then((fn) => fn()));
  });

  async function handleDrop(paths: string[]) {
    if (copying) {
      uiState.showToast("Already copying books into your library. Try again once it's finished.");
      return;
    }
    const library = libraryState.audiobookFolder;
    if (!library) {
      uiState.showToast("Choose a library folder first, then drop books onto the window.", {
        action: { label: "Open Settings", run: () => uiState.navigateToSettings() },
      });
      return;
    }

    let plan: ImportPlan;
    try {
      plan = await invoke<ImportPlan>("plan_library_import", { paths, library });
    } catch (e) {
      uiState.showToast(`Couldn't read the dropped items: ${e}`, { kind: "error" });
      return;
    }

    if (plan.items.length === 0) {
      if (plan.has_items_in_library) {
        // Already in the library folder — nothing to copy, just pick up any changes
        await libraryState.importBooks(library);
        uiState.showToast("Those are already in your library, so it's been rescanned instead.");
      } else {
        const reasons = [...new Set(plan.skipped.map((s) => s.reason))].join(", ");
        uiState.showToast(`Nothing to import${reasons ? ` (${reasons})` : ""}.`);
      }
      return;
    }

    pending = { paths, plan };
  }

  async function confirmCopy() {
    if (!pending) return;
    const { paths } = pending;
    const count = pending.plan.items.length;
    const library = libraryState.audiobookFolder;
    pending = null;
    copying = true;
    cancelling = false;
    progress = null;
    libraryState.copyInProgress = true;
    try {
      const result = await invoke<{ copied: number; cancelled: boolean }>("copy_into_library", { paths, library });
      if (result.cancelled) {
        uiState.showToast("Import cancelled. Nothing was added.");
      } else {
        await libraryState.importBooks(library);
        uiState.showToast(count === 1 ? "Added 1 item to your library." : `Added ${count} items to your library.`, { kind: "success" });
      }
    } catch (e) {
      uiState.showToast(`Copy failed: ${e}. Nothing was added.`, { durationMs: 10000, kind: "error" });
    } finally {
      libraryState.copyInProgress = false;
      copying = false;
      progress = null;
    }
  }

  function cancelCopy() {
    cancelling = true;
    invoke("cancel_library_import");
  }

  // Close the confirm dialog only on a full click on the backdrop
  let pressedOnBackdrop = false;
</script>

<svelte:window
  onkeydown={(e) => {
    if (!pending) return;
    if (e.key === "Escape") pending = null;
    else if (e.key === "Enter") confirmCopy();
  }}
/>

{#if dragging}
  <div class="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center bg-canvas animate-fadeIn">
    <div class="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-warm-400/60 px-12 py-10 dark:border-neutral-500/40">
      <svg class="h-10 w-10 text-warm-400 dark:text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
      </svg>
      {#if libraryState.audiobookFolder}
        <p class="text-[14px] font-medium text-warm-700 dark:text-neutral-300">Drop to copy into your library</p>
        <p class="text-[12px] text-warm-500 dark:text-neutral-500">Folders, .m4b files or audio files · originals are kept</p>
      {:else}
        <p class="text-[14px] font-medium text-warm-700 dark:text-neutral-300">Set a library folder in Settings first</p>
      {/if}
    </div>
  </div>
{/if}

{#if pending}
  {@const plan = pending.plan}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fadeIn"
    onmousedown={(e) => (pressedOnBackdrop = e.target === e.currentTarget)}
    onclick={(e) => {
      if (pressedOnBackdrop && e.target === e.currentTarget) pending = null;
    }}
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="drop-import-title"
      class="animate-scaleIn mx-4 flex w-full flex-col overflow-hidden rounded-2xl border border-warm-200 bg-warm-50 shadow-2xl shadow-black/20 dark:border-neutral-800 dark:bg-neutral-900 dark:shadow-black/60 max-h-[80vh] max-w-md"
    >
      <div class="flex min-h-0 flex-1 flex-col px-5 pt-5 pb-4">
      <h3 id="drop-import-title" class="text-[15px] font-semibold text-warm-900 dark:text-white">
        Copy {plan.items.length === 1 ? `"${plan.items[0].name}"` : `${plan.items.length} items`} into your library?
      </h3>
      <p class="mt-1.5 text-[13px] leading-relaxed text-warm-600 dark:text-neutral-400">
        {formatBytes(plan.total_bytes)} will be copied to <span class="font-medium text-warm-700 dark:text-neutral-300">{libraryState.audiobookFolder}</span>. The originals are left where they are.
      </p>

      {#if plan.items.length > 1}
        <ul class="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto rounded-lg border border-warm-200 bg-white p-2 dark:border-neutral-800 dark:bg-neutral-950">
          {#each plan.items as item}
            <li class="flex items-center justify-between gap-3 px-1 text-[12.5px]">
              <span class="truncate">{item.name}</span>
              <span class="shrink-0 tabular-nums text-warm-400 dark:text-neutral-500">{formatBytes(item.bytes)}</span>
            </li>
          {/each}
        </ul>
      {/if}

      {#if plan.skipped.length > 0}
        <p class="mt-3 text-[11.5px] text-warm-500 dark:text-neutral-500">
          Skipping {plan.skipped.map((s) => `${fileName(s.path)} (${s.reason})`).join(", ")}.
        </p>
      {/if}
      </div>

      <div class="flex items-center justify-end gap-2 border-t border-warm-200 bg-warm-100 px-5 py-3 dark:border-neutral-800 dark:bg-neutral-950">
        <button onclick={() => (pending = null)} class="btn-secondary h-9 rounded-lg border px-4 text-[13px] font-medium text-warm-700 dark:text-neutral-200">
          Cancel
        </button>
        <button onclick={confirmCopy} class="btn-primary h-9 rounded-lg px-5 text-[13px] font-semibold disabled:opacity-50">
          Copy
        </button>
      </div>
    </div>
  </div>
{/if}

{#if copying}
  <div
    role="status"
    class="animate-scaleIn rounded-xl border border-warm-200 bg-warm-50 shadow-xl shadow-black/15 dark:border-neutral-800 dark:bg-neutral-900 dark:shadow-black/50 fixed bottom-24 right-4 z-[60] w-80 p-3.5"
  >
    <div class="flex items-center justify-between gap-3">
      <p class="min-w-0 truncate text-[12.5px] font-medium">
        {cancelling ? "Cancelling…" : progress?.current ? `Copying "${progress.current}"` : "Preparing…"}
      </p>
      <button
        onclick={cancelCopy}
        disabled={cancelling}
        class="shrink-0 text-[11px] font-medium text-warm-500 transition-colors hover:text-red-500 disabled:opacity-50 dark:text-neutral-400"
      >
        Cancel
      </button>
    </div>
    <div class="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-warm-200 dark:bg-neutral-800">
      <div class="h-full rounded-full bg-accent-500 transition-[width] duration-200" style="width: {progressPct}%"></div>
    </div>
    {#if progress}
      <p class="mt-1.5 text-[11px] tabular-nums text-warm-500 dark:text-neutral-500">
        {formatBytes(progress.copied_bytes)} of {formatBytes(progress.total_bytes)}
      </p>
    {/if}
  </div>
{/if}
