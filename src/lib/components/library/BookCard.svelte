<script lang="ts">
  import type { Book } from "../../types";
  import { uiState } from "../../state/ui.svelte";
  import { playerState } from "../../state/player.svelte";
  import { bookMenuItems } from "../../utils/bookMenu";
  import { coverSrc } from "../../utils/covers";
  import ContextMenu from "../shared/ContextMenu.svelte";
  import EditMetadataModal from "../shared/EditMetadataModal.svelte";

  let { book }: { book: Book } = $props();
  let showEditMetadata = $state(false);

  let isCurrentlyPlaying = $derived(playerState.currentBookId === book.id);

  let contextMenu = $state<{ x: number; y: number } | null>(null);

  let contextMenuItems = $derived(bookMenuItems(book, { onEdit: () => (showEditMetadata = true) }));

  function handleClick() {
    uiState.navigateToBook(book.id);
  }

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    contextMenu = { x: e.clientX, y: e.clientY };
  }

  /** The "⋯" button opens the same menu, dropped down below the button and right-aligned to it. */
  function toggleMenuFromButton(e: Event) {
    e.stopPropagation();
    if (contextMenu) {
      contextMenu = null;
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    contextMenu = { x: Math.max(8, rect.right - 180), y: rect.bottom + 6 };
  }
</script>

<button
  onclick={handleClick}
  oncontextmenu={handleContextMenu}
  class="group w-full text-left"
>
  <div
    class="relative aspect-square w-full overflow-hidden rounded-lg shadow-md shadow-black/10 transition-shadow duration-300 group-hover:shadow-xl group-hover:shadow-black/20 dark:shadow-black/30 dark:group-hover:shadow-black/60
      {isCurrentlyPlaying ? 'ring-2 ring-accent-500 ring-offset-2 ring-offset-warm-50 dark:ring-offset-neutral-950' : 'ring-1 ring-black/5 dark:ring-white/5'}"
  >
    <!-- Cover Art -->
    {#if book.cover_art}
      <img
        src={coverSrc(book.cover_art)}
        alt={book.title}
        loading="lazy"
        decoding="async"
        class="h-full w-full object-cover"
      />
    {:else}
      <div class="flex h-full w-full items-center justify-center bg-gradient-to-br from-warm-200 to-warm-300 dark:from-neutral-800 dark:to-neutral-900">
        <svg class="h-14 w-14 text-warm-400/50 dark:text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="0.8">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      </div>
    {/if}

    <!-- Subtle dark overlay on hover -->
    <div class="absolute inset-0 bg-black/25 opacity-0 transition-opacity duration-200 group-hover:opacity-100"></div>

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- Play button (bottom left) — slides up on hover, Spotify-style -->
    <div
      role="button"
      tabindex="-1"
      onclick={(e: MouseEvent) => { e.stopPropagation(); playerState.openBook(book.id); }}
      onkeydown={(e: KeyboardEvent) => { if (e.key === 'Enter') { e.stopPropagation(); playerState.openBook(book.id); } }}
      class="absolute bottom-3.5 left-2.5 flex h-8 w-8 translate-y-2 cursor-pointer items-center justify-center btn-overlay rounded-full opacity-0 shadow-lg shadow-black/30 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:scale-105 active:scale-95 group-hover:translate-y-0 group-hover:opacity-100"
    >
      <svg class="ml-0.5 h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M8 5v14l11-7z" />
      </svg>
    </div>

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- More actions (bottom right) — opens the right-click menu. It stays visible while the menu is open.
         Stopping mousedown keeps the menu's click-outside handler from closing it before the toggle runs. -->
    <div
      role="button"
      tabindex="-1"
      title="More actions"
      aria-label="More actions"
      aria-haspopup="menu"
      aria-expanded={contextMenu !== null}
      onmousedown={(e: MouseEvent) => e.stopPropagation()}
      onclick={toggleMenuFromButton}
      onkeydown={(e: KeyboardEvent) => { if (e.key === 'Enter') toggleMenuFromButton(e); }}
      class="absolute bottom-3.5 right-2.5 flex h-8 w-8 cursor-pointer items-center justify-center btn-overlay rounded-full shadow-lg shadow-black/30 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:scale-105 active:scale-95
        {contextMenu ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100'}"
    >
      <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
        <circle cx="5" cy="12" r="1.9" />
        <circle cx="12" cy="12" r="1.9" />
        <circle cx="19" cy="12" r="1.9" />
      </svg>
    </div>

    <!-- Now playing indicator -->
    {#if isCurrentlyPlaying && playerState.isPlaying}
      <!-- Shares the bottom-left corner with the play button, so it fades out while that's showing -->
      <div class="absolute bottom-2 left-2 flex items-center rounded-full bg-black/60 px-2 py-1 ring-1 ring-white/10 backdrop-blur-md transition-opacity duration-200 group-hover:opacity-0">
        <div class="waveform-bars h-2.5">
          <span class="bg-accent-400"></span>
          <span class="bg-accent-400"></span>
          <span class="bg-accent-400"></span>
          <span class="bg-accent-400"></span>
          <span class="bg-accent-400"></span>
        </div>
      </div>
    {/if}

  </div>

  <!-- Title + author -->
  <div class="mt-2 min-w-0 px-0.5">
    <p class="truncate text-[13px] font-semibold leading-snug {isCurrentlyPlaying ? 'text-accent-600 dark:text-accent-400' : ''}">
      {book.title}
    </p>
    <p class="mt-0.5 truncate text-[11.5px] text-warm-500 dark:text-neutral-500">
      {book.author}
    </p>
  </div>
</button>

{#if contextMenu}
  <ContextMenu
    x={contextMenu.x}
    y={contextMenu.y}
    items={contextMenuItems}
    onclose={() => (contextMenu = null)}
  />
{/if}

{#if showEditMetadata}
  <EditMetadataModal {book} onclose={() => (showEditMetadata = false)} />
{/if}
