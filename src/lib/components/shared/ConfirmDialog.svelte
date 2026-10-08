<script lang="ts">
  import { onMount } from "svelte";

  let {
    open,
    title,
    description,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    danger = false,
    onconfirm,
    oncancel,
  }: {
    open: boolean;
    title: string;
    description: string;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
    onconfirm: () => void;
    oncancel: () => void;
  } = $props();

  onMount(() => {
    function onKey(e: KeyboardEvent) {
      if (!open) return;
      if (e.key === "Escape") {
        e.preventDefault();
        oncancel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        onconfirm();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Only close when the press both starts and ends on the backdrop
  let pressedOnBackdrop = false;
</script>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fadeIn"
    onmousedown={(e) => (pressedOnBackdrop = e.target === e.currentTarget)}
    onclick={(e) => {
      if (pressedOnBackdrop && e.target === e.currentTarget) oncancel();
      pressedOnBackdrop = false;
    }}
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-description"
      class="animate-scaleIn mx-4 flex w-full flex-col overflow-hidden rounded-2xl border border-warm-200 bg-warm-50 shadow-2xl shadow-black/20 dark:border-neutral-800 dark:bg-neutral-900 dark:shadow-black/60 max-w-sm"
    >
      <div class="px-5 pt-5 pb-4">
        <h3 id="confirm-dialog-title" class="text-[15px] font-semibold text-warm-900 dark:text-white">{title}</h3>
        <p id="confirm-dialog-description" class="mt-2 text-[13px] leading-relaxed text-warm-600 dark:text-neutral-400">{description}</p>
      </div>
      <div class="flex items-center justify-end gap-2 border-t border-warm-200 bg-warm-100 px-5 py-3 dark:border-neutral-800 dark:bg-neutral-950">
        <button onclick={oncancel} class="btn-secondary h-9 rounded-lg border px-4 text-[13px] font-medium text-warm-700 dark:text-neutral-200">
          {cancelLabel}
        </button>
        <button onclick={onconfirm} class={danger ? "h-9 rounded-lg bg-red-600 px-5 text-[13px] font-semibold text-white transition-colors hover:bg-red-700" : "btn-primary h-9 rounded-lg px-5 text-[13px] font-semibold disabled:opacity-50"}>
          {confirmLabel}
        </button>
      </div>
    </div>
  </div>
{/if}
