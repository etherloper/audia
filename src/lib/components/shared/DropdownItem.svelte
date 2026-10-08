<script lang="ts">
  import type { Snippet } from "svelte";

  /** A choice in a Dropdown: a tick when selected, the label, and an optional count. */
  let {
    checked = false,
    onclick,
    children,
    trailing,
  }: {
    checked?: boolean;
    onclick: () => void;
    children: Snippet;
    trailing?: string | number;
  } = $props();
</script>

<button
  role="menuitemradio"
  aria-checked={checked}
  {onclick}
  class="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] outline-none transition-colors hover:bg-warm-100/80 focus-visible:bg-warm-100/80 dark:hover:bg-white/[0.06] dark:focus-visible:bg-white/[0.06]
    {checked ? 'font-medium text-warm-900 dark:text-white' : 'text-warm-700 dark:text-neutral-200'}"
>
  <span class="flex h-4 w-4 shrink-0 items-center justify-center">
    {#if checked}
      <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
    {/if}
  </span>
  <span class="min-w-0 flex-1 truncate">{@render children()}</span>
  {#if trailing !== undefined}
    <span class="shrink-0 text-[11.5px] tabular-nums text-warm-400 dark:text-neutral-500">{trailing}</span>
  {/if}
</button>
