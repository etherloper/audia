<script lang="ts">
  import { PLAYBACK_SPEEDS } from "../../state/settings.svelte";

  /**
   * Playback speed as a slider over the preset speeds (0.5× to 3× in 0.25× steps),
   * with labelled marks that can be clicked to jump straight to that speed.
   * Arrow keys and the mouse wheel step one notch.
   */
  let {
    value,
    onchange,
    label = "Playback speed",
    id,
  }: {
    value: number;
    onchange: (speed: number) => void;
    label?: string;
    id?: string;
  } = $props();

  const MIN = PLAYBACK_SPEEDS[0];
  const MAX = PLAYBACK_SPEEDS[PLAYBACK_SPEEDS.length - 1];
  const STEP = 0.25;
  const MARKS = [0.5, 1, 1.5, 2, 2.5, 3];

  const percent = (v: number) => ((v - MIN) / (MAX - MIN)) * 100;
  const format = (v: number) => `${v}×`;

  function set(v: number) {
    const snapped = Math.round(Math.min(MAX, Math.max(MIN, v)) / STEP) * STEP;
    if (snapped !== value) onchange(snapped);
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    set(value + (e.deltaY < 0 ? STEP : -STEP));
  }
</script>

<div class="w-full select-none">
  <div class="relative flex h-5 items-center" onwheel={onWheel}>
    <input
      {id}
      type="range"
      min={MIN}
      max={MAX}
      step={STEP}
      {value}
      oninput={(e) => set(Number((e.target as HTMLInputElement).value))}
      aria-label={label}
      aria-valuetext={format(value)}
      class="speed-slider w-full"
      style="--fill: {percent(value)}%"
    />
  </div>
  <!-- Labelled marks; click one to jump to it -->
  <div class="relative mt-1 h-4">
    {#each MARKS as mark}
      <button
        type="button"
        tabindex="-1"
        onclick={() => set(mark)}
        class="absolute -translate-x-1/2 rounded px-0.5 text-[10.5px] tabular-nums transition-colors
          {Math.abs(mark - value) < 0.01
            ? 'font-semibold text-warm-900 dark:text-white'
            : 'text-warm-400 hover:text-warm-700 dark:text-neutral-500 dark:hover:text-neutral-300'}"
        style="left: calc(7px + (100% - 14px) * {percent(mark) / 100})"
      >
        {format(mark)}
      </button>
    {/each}
  </div>
</div>

<style>
  /* Track filled up to the thumb in the accent colour; 14px thumb */
  .speed-slider {
    height: 4px;
    appearance: none;
    -webkit-appearance: none;
    border-radius: 9999px;
    outline: none;
    cursor: pointer;
    background: linear-gradient(to right, var(--color-accent-500) var(--fill), var(--color-warm-200) var(--fill));
  }
  :global(html.dark) .speed-slider {
    background: linear-gradient(to right, var(--color-accent-500) var(--fill), rgb(255 255 255 / 0.1) var(--fill));
  }
  .speed-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 9999px;
    background: var(--color-accent-500);
    border: 2px solid var(--color-canvas);
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.3);
    transition: transform 0.15s;
  }
  .speed-slider:hover::-webkit-slider-thumb,
  .speed-slider:focus-visible::-webkit-slider-thumb {
    transform: scale(1.15);
  }
  .speed-slider:focus-visible {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent-500) 25%, transparent);
  }
</style>
