<script lang="ts">
  import { onMount } from "svelte";
  import { getDb } from "../../utils/db";
  import { dayKey, lastNDays, streaks } from "../../utils/listening";
  import { formatTimeLeft } from "../../utils/format";

  let secondsByDay = $state(new Map<string, number>());
  let loaded = $state(false);
  let range = $state<7 | 30>(7);
  let hovered = $state<number | null>(null);

  onMount(async () => {
    const db = await getDb();
    const rows = await db.select<{ day: string; secs: number }[]>(
      "SELECT day, SUM(seconds) AS secs FROM listening_log GROUP BY day",
    );
    secondsByDay = new Map(rows.map((r) => [r.day, r.secs]));
    loaded = true;
  });

  const today = new Date();
  const todayKey = dayKey(today);

  let days = $derived(
    lastNDays(range, today).map((date) => ({
      date,
      key: dayKey(date),
      secs: secondsByDay.get(dayKey(date)) ?? 0,
    })),
  );
  let total = $derived(days.reduce((sum, d) => sum + d.secs, 0));
  let streak = $derived(streaks(secondsByDay, today));
  let hasHistory = $derived(secondsByDay.size > 0);

  /** Round the axis top up to a clean step: 15-minute steps under an hour, else 30. */
  let axisMax = $derived.by(() => {
    const maxMins = Math.max(...days.map((d) => d.secs / 60), 1);
    const step = maxMins <= 60 ? 15 : 30;
    return Math.ceil(maxMins / step) * step * 60;
  });

  const duration = (secs: number) => (secs === 0 ? "0m" : formatTimeLeft(secs));
  const weekday = (d: Date) => d.toLocaleDateString(undefined, { weekday: "short" });
  const fullDate = (d: Date) => d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  // 30-day view: label every 5th day so labels don't collide
  const showLabel = (i: number) => range === 7 || (range - 1 - i) % 5 === 0;
</script>

<div class="rounded-2xl border border-warm-200/50 bg-warm-100/20 px-5 py-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
  <div class="flex items-center justify-between">
    <p class="text-[11px] font-semibold uppercase tracking-[0.1em] text-warm-400 dark:text-neutral-500">Listening time</p>
    <div class="flex overflow-hidden rounded-md border border-warm-200 dark:border-neutral-700" role="group" aria-label="Range">
      {#each [7, 30] as r}
        <button
          onclick={() => (range = r as 7 | 30)}
          aria-pressed={range === r}
          class="h-6 px-2 text-[11px] font-medium transition-colors
            {r === 30 ? 'border-l border-warm-200 dark:border-neutral-700' : ''}
            {range === r ? 'bg-warm-800 text-white dark:bg-white dark:text-black' : 'text-warm-500 hover:bg-warm-100 dark:text-neutral-400 dark:hover:bg-neutral-800'}"
        >
          {r} days
        </button>
      {/each}
    </div>
  </div>

  {#if !loaded}
    <div class="h-[188px]"></div>
  {:else if !hasHistory}
    <p class="mt-4 text-[13px] text-warm-500 dark:text-neutral-400">No listening recorded yet.</p>
    <p class="mt-1 text-[12px] text-warm-400 dark:text-neutral-500">Daily listening is tracked from this version onwards. It'll show up here as you listen.</p>
  {:else}
    <!-- Stat tiles -->
    <div class="mt-3 grid grid-cols-3 gap-3">
      <div>
        <p class="text-[11px] text-warm-500 dark:text-neutral-500">Last {range} days</p>
        <p class="text-[20px] font-bold leading-tight text-warm-800 dark:text-white">{duration(total)}</p>
      </div>
      <div>
        <p class="text-[11px] text-warm-500 dark:text-neutral-500">Daily average</p>
        <p class="text-[20px] font-bold leading-tight text-warm-800 dark:text-white">{duration(total / range)}</p>
      </div>
      <div>
        <p class="text-[11px] text-warm-500 dark:text-neutral-500">Streak</p>
        <p class="text-[20px] font-bold leading-tight text-warm-800 dark:text-white">
          {streak.current} {streak.current === 1 ? "day" : "days"}
        </p>
        <p class="text-[11px] text-warm-400 dark:text-neutral-500">Best: {streak.longest}</p>
      </div>
    </div>

    <!-- Column chart: one series, so no legend; the card title names it -->
    <div class="relative mt-4 h-[120px]" aria-hidden="true">
      <!-- Axis: top and baseline hairlines, labelled -->
      <div class="absolute inset-x-0 top-0 border-t border-warm-200/80 dark:border-white/[0.07]"></div>
      <span class="absolute right-0 -top-4 text-[10px] tabular-nums text-warm-400 dark:text-neutral-500">{duration(axisMax)}</span>
      <div class="absolute inset-x-0 bottom-0 border-t border-warm-300/80 dark:border-white/[0.12]"></div>

      <div class="absolute inset-0 flex items-end gap-[2px]">
        {#each days as d, i (d.key)}
          {@const pct = (d.secs / axisMax) * 100}
          <!-- The whole column slot is the hover target, not just the (maybe tiny) bar -->
          <div
            class="relative flex h-full flex-1 items-end justify-center"
            onmouseenter={() => (hovered = i)}
            onmouseleave={() => (hovered = null)}
            role="presentation"
          >
            {#if d.secs > 0}
              <div
                class="w-full max-w-6 rounded-t bg-accent-600 transition-opacity dark:bg-accent-500 {hovered !== null && hovered !== i ? 'opacity-50' : ''}"
                style="height: max({pct}%, 2px)"
              ></div>
            {/if}
            {#if d.key === todayKey && d.secs > 0 && hovered === null && range === 7}
              <!-- Direct label on the one column the story is about -->
              <!-- 7-day view only: 30-day columns are too narrow for a label (the tooltip covers them).
                   Today is always the last column, so anchor to the right edge rather than centring. -->
              <span class="absolute right-0 whitespace-nowrap text-[10px] font-semibold tabular-nums text-warm-700 dark:text-neutral-200" style="bottom: calc({pct}% + 4px)">
                {duration(d.secs)}
              </span>
            {/if}
            {#if hovered === i}
              <div
                class="tooltip-surface pointer-events-none absolute z-10 whitespace-nowrap rounded-md px-2 py-1 text-[11px]"
                style="bottom: calc({Math.max(pct, 0)}% + 6px); {i < days.length / 2 ? 'left: 0' : 'right: 0'}"
              >
                <span class="font-semibold">{fullDate(d.date)}</span> · {duration(d.secs)}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
    <div class="mt-1.5 flex gap-[2px]" aria-hidden="true">
      {#each days as d, i (d.key)}
        <span class="flex-1 text-center text-[10px] text-warm-400 dark:text-neutral-500">
          {showLabel(i) ? (range === 7 ? weekday(d.date) : d.date.getDate()) : ""}
        </span>
      {/each}
    </div>

    <!-- Table view for screen readers -->
    <table class="sr-only">
      <caption>Listening time per day, last {range} days</caption>
      <thead><tr><th>Day</th><th>Time listened</th></tr></thead>
      <tbody>
        {#each days as d (d.key)}
          <tr><td>{fullDate(d.date)}</td><td>{duration(d.secs)}</td></tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>
