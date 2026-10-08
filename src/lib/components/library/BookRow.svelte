<script lang="ts" module>
  /**
   * Shared by the header and every row so the columns line up. "Added" only
   * appears when the list (an @container) is wide enough for it.
   */
  export const ROW_COLUMNS =
    "grid grid-cols-[40px_minmax(0,2fr)_minmax(0,1.2fr)_72px_128px_32px] @2xl:grid-cols-[40px_minmax(0,2fr)_minmax(0,1.2fr)_72px_128px_104px_32px] items-center gap-x-4";
</script>

<script lang="ts">
  import type { Book } from "../../types";
  import { uiState } from "../../state/ui.svelte";
  import { playerState } from "../../state/player.svelte";
  import { libraryState } from "../../state/library.svelte";
  import { coverSrc } from "../../utils/covers";
  import { formatDurationShort } from "../../utils/format";
  import { bookMenuItems } from "../../utils/bookMenu";
  import ContextMenu from "../shared/ContextMenu.svelte";
  import EditMetadataModal from "../shared/EditMetadataModal.svelte";

  let { book }: { book: Book } = $props();
  let showEditMetadata = $state(false);
  let contextMenu = $state<{ x: number; y: number } | null>(null);

  let isCurrent = $derived(playerState.currentBookId === book.id);
  let progress = $derived(libraryState.progressMap.get(book.id));
  let finished = $derived(!!progress?.finished_at);
  let percent = $derived(Math.round(libraryState.progressFraction(book) * 100));

  /** created_at is SQLite UTC ("2026-03-12 09:30:00"). */
  let added = $derived.by(() => {
    const date = new Date(book.created_at.replace(" ", "T") + "Z");
    return Number.isNaN(date.getTime())
      ? ""
      : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  });

  function openMenuAt(x: number, y: number) {
    contextMenu = { x, y };
  }

  function toggleMenuFromButton(e: MouseEvent) {
    e.stopPropagation();
    if (contextMenu) {
      contextMenu = null;
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    openMenuAt(Math.max(8, rect.right - 180), rect.bottom + 6);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  role="button"
  tabindex="0"
  onclick={() => uiState.navigateToBook(book.id)}
  onkeydown={(e) => { if (e.key === "Enter") uiState.navigateToBook(book.id); }}
  oncontextmenu={(e) => { e.preventDefault(); openMenuAt(e.clientX, e.clientY); }}
  class="group {ROW_COLUMNS} h-14 cursor-pointer rounded-lg px-2 text-[13px] outline-none transition-colors hover:bg-warm-100/80 focus-visible:ring-2 focus-visible:ring-accent-500/50 dark:hover:bg-white/[0.04]
    {contextMenu ? 'bg-warm-100/80 dark:bg-white/[0.04]' : ''}"
>
  <!-- Cover, with a play button on hover -->
  <div class="relative h-10 w-10 overflow-hidden rounded-md ring-1 ring-black/5 dark:ring-white/10">
    {#if book.cover_art}
      <img src={coverSrc(book.cover_art)} alt="" loading="lazy" decoding="async" class="h-full w-full object-cover" />
    {:else}
      <div class="h-full w-full bg-gradient-to-br from-warm-200 to-warm-300 dark:from-neutral-800 dark:to-neutral-900"></div>
    {/if}
    <button
      onclick={(e) => { e.stopPropagation(); playerState.openBook(book.id); }}
      class="btn-overlay absolute inset-0 flex items-center justify-center rounded-md opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
      title="Play"
      aria-label="Play {book.title}"
    >
      <svg class="ml-0.5 h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
    </button>
  </div>

  <!-- Title (+ series) -->
  <div class="min-w-0">
    <p class="flex items-center gap-2 truncate font-semibold {isCurrent ? 'text-accent-600 dark:text-accent-400' : ''}">
      {#if isCurrent && playerState.isPlaying}
        <span class="waveform-bars h-2.5 shrink-0">
          <span class="bg-current"></span><span class="bg-current"></span><span class="bg-current"></span><span class="bg-current"></span><span class="bg-current"></span>
        </span>
      {/if}
      <span class="truncate">{book.title}</span>
    </p>
    {#if book.series}
      <p class="truncate text-[11.5px] text-warm-400 dark:text-neutral-500">
        {book.series}{book.series_index != null ? ` · Book ${book.series_index}` : ""}
      </p>
    {/if}
  </div>

  <p class="truncate text-warm-600 dark:text-neutral-400">{book.author}</p>

  <p class="text-right tabular-nums text-warm-500 dark:text-neutral-500">{formatDurationShort(book.total_duration_secs)}</p>

  <!-- Progress -->
  <div class="flex items-center gap-2 text-[11.5px] tabular-nums text-warm-500 dark:text-neutral-500">
    {#if finished}
      <svg class="h-3.5 w-3.5 text-accent-600 dark:text-accent-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
      Finished
    {:else if progress && percent > 0}
      <div class="h-1 w-16 overflow-hidden rounded-full bg-warm-200 dark:bg-white/[0.08]">
        <div class="h-full rounded-full bg-accent-500" style="width: {percent}%"></div>
      </div>
      {percent}%
    {:else}
      <span class="text-warm-300 dark:text-neutral-700">—</span>
    {/if}
  </div>

  <p class="hidden text-[12px] tabular-nums text-warm-500 @2xl:block dark:text-neutral-500">{added}</p>

  <!-- More actions -->
  <button
    onmousedown={(e) => e.stopPropagation()}
    onclick={toggleMenuFromButton}
    aria-haspopup="menu"
    aria-expanded={contextMenu !== null}
    class="flex h-8 w-8 items-center justify-center rounded-full text-warm-500 transition-all hover:bg-warm-200/70 hover:text-warm-900 focus-visible:opacity-100 dark:text-neutral-400 dark:hover:bg-white/[0.08] dark:hover:text-white
      {contextMenu ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}"
    title="More actions"
    aria-label="More actions"
  >
    <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.9" /><circle cx="12" cy="12" r="1.9" /><circle cx="19" cy="12" r="1.9" /></svg>
  </button>
</div>

{#if contextMenu}
  <ContextMenu
    x={contextMenu.x}
    y={contextMenu.y}
    items={bookMenuItems(book, { onEdit: () => (showEditMetadata = true) })}
    onclose={() => (contextMenu = null)}
  />
{/if}

{#if showEditMetadata}
  <EditMetadataModal {book} onclose={() => (showEditMetadata = false)} />
{/if}
