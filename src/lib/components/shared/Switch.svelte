<script lang="ts">
  /**
   * On/off switch. On: the accent-coloured track with a knob in the accent's
   * contrasting colour (so it still shows when the accent is white, as it is by
   * default in dark mode). Off: a dim outlined track and a dim knob.
   */
  let {
    checked,
    onchange,
    labelledby,
  }: {
    checked: boolean;
    onchange: (checked: boolean) => void;
    labelledby: string;
  } = $props();
</script>

<button
  type="button"
  role="switch"
  aria-checked={checked}
  aria-labelledby={labelledby}
  onclick={() => onchange(!checked)}
  class="relative h-5 w-9 shrink-0 rounded-full outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-accent-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas
    {checked
      ? 'bg-accent-500'
      : 'bg-warm-300 dark:bg-neutral-800 dark:ring-1 dark:ring-inset dark:ring-white/15'}"
>
  <span
    class="absolute top-0.5 left-0.5 h-4 w-4 rounded-full shadow-sm transition-[transform,background-color] duration-200
      {checked ? 'translate-x-4 bg-accent-fg' : 'bg-white dark:bg-neutral-500'}"
  ></span>
</button>
