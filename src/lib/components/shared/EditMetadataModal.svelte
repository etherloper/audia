<script lang="ts">
  import type { Book } from "../../types";
  import { libraryState } from "../../state/library.svelte";
  import { coverSrc, searchCovers, type CoverCandidate } from "../../utils/covers";
  import { open } from "@tauri-apps/plugin-dialog";
  import { invoke } from "@tauri-apps/api/core";
  import { portal } from "../../utils/portal";
  import { joinList, parseList } from "../../utils/tags";
  import TagInput from "./TagInput.svelte";

  let {
    book,
    onclose,
  }: {
    book: Book;
    onclose: () => void;
  } = $props();

  function snapshot(b: Book) {
    return {
      title: b.title,
      author: b.author,
      narrator: b.narrator ?? "",
      series: b.series ?? "",
      seriesIndex: b.series_index != null ? String(b.series_index) : "",
      description: b.description ?? "",
      coverUrl: b.cover_art ?? "",
      genres: parseList(b.genres),
      tags: parseList(b.tags),
    };
  }
  // svelte-ignore state_referenced_locally
  const init = snapshot(book);
  let title = $state(init.title);
  let author = $state(init.author);
  let narrator = $state(init.narrator);
  let series = $state(init.series);
  let seriesIndex = $state(init.seriesIndex);
  // Accepts "3", "2.5" (novellas) or blank
  let seriesIndexValid = $derived(seriesIndex.trim() === "" || Number.isFinite(Number(seriesIndex.trim())));
  let description = $state(init.description);
  let coverUrl = $state(init.coverUrl);
  let genres = $state(init.genres);
  let tags = $state(init.tags);
  let saving = $state(false);
  let fetching = $state(false);
  let choosingFile = $state(false);

  async function save() {
    if (!seriesIndexValid) return;
    saving = true;
    await libraryState.updateBookMetadata(book.id, {
      title,
      author,
      narrator: narrator || null,
      series: series.trim() || null,
      series_index: seriesIndex.trim() === "" ? null : Number(seriesIndex.trim()),
      cover_art: coverUrl || null,
      description: description || null,
      genres: joinList(genres),
      tags: joinList(tags),
    });
    saving = false;
    onclose();
  }

  // "Find online": show the covers found so the right edition can be picked
  let candidates = $state<CoverCandidate[] | null>(null);
  let searchNote = $state("");
  let failedThumbs = $state(new Set<string>());

  async function findOnline() {
    fetching = true;
    searchNote = "";
    try {
      const result = await searchCovers(title, author);
      failedThumbs = new Set();
      candidates = result.candidates;
      const notes: string[] = [];
      if (!result.reachable) notes.push("Couldn't reach Open Library or Google Books. Check your connection.");
      else if (result.candidates.length === 0) notes.push(`No covers found for "${title}".`);
      if (result.description && !description.trim()) {
        description = result.description;
        notes.push("Filled in the description.");
      }
      searchNote = notes.join(" ");
    } finally {
      fetching = false;
    }
  }

  function pickCandidate(c: CoverCandidate) {
    coverUrl = c.url;
    candidates = null;
  }

  async function chooseCoverFile() {
    choosingFile = true;
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }],
      });
      if (selected) {
        // Copied into the app's covers dir so the book keeps its cover even if the original moves
        coverUrl = await invoke<string>("import_cover_file", { path: selected });
      }
    } finally {
      choosingFile = false;
    }
  }

  // Only close when the press both started and ended on the backdrop, so
  // drag-selecting text inside a field and releasing outside doesn't dismiss.
  let pressedOnBackdrop = false;

  function onBackdropMouseDown(e: MouseEvent) {
    pressedOnBackdrop = e.target === e.currentTarget;
  }

  function onBackdropClick(e: MouseEvent) {
    if (pressedOnBackdrop && e.target === e.currentTarget) onclose();
    pressedOnBackdrop = false;
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key !== "Escape") return;
    if (candidates) candidates = null;
    else onclose();
  }

  // Solid (opaque) field styling, shared by every input
  const labelClass = "block text-[11px] font-semibold uppercase tracking-wider text-warm-500 dark:text-neutral-400";
  const fieldClass =
    "mt-1.5 w-full rounded-lg border border-warm-200 bg-white px-3 py-2 text-[13px] text-warm-900 outline-none transition-colors placeholder:text-warm-300 hover:border-warm-300 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-neutral-600 dark:hover:border-neutral-600";

  // Show a placeholder instead of a broken image when the cover can't load
  let coverBroken = $state(false);
  $effect(() => {
    coverUrl;
    coverBroken = false;
  });
</script>

<svelte:window onkeydown={onKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- Portalled to <body>: it's opened from book cards, whose wrappers would otherwise contain it -->
<div
  use:portal
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fadeIn"
  onmousedown={onBackdropMouseDown}
  onclick={onBackdropClick}
>
  <div
    role="dialog"
    aria-modal="true"
    aria-labelledby="meta-dialog-title"
    class="animate-scaleIn mx-4 flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-warm-200 bg-warm-50 shadow-2xl shadow-black/20 dark:border-neutral-800 dark:bg-neutral-900 dark:shadow-black/60"
  >
    <!-- Header -->
    <div class="flex items-start justify-between gap-4 border-b border-warm-200 px-6 py-4 dark:border-neutral-800">
      <div class="min-w-0">
        <h3 id="meta-dialog-title" class="text-[15px] font-semibold text-warm-900 dark:text-white">Edit metadata</h3>
        <p class="mt-0.5 truncate text-[12px] text-warm-500 dark:text-neutral-400">{book.title}</p>
      </div>
      <button
        onclick={onclose}
        class="-mr-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-warm-400 transition-colors hover:bg-warm-200/60 hover:text-warm-800 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-white"
        aria-label="Close"
        title="Close (Esc)"
      >
        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" d="M6 6l12 12M6 18L18 6" />
        </svg>
      </button>
    </div>

    <!-- Online results: pick a cover -->
    {#if candidates !== null || searchNote}
      <div class="animate-fadeIn border-b border-warm-200 bg-warm-100/70 px-6 py-4 dark:border-neutral-800 dark:bg-neutral-950/60">
        <div class="flex items-center justify-between gap-3">
          <p class="text-[12px] font-semibold text-warm-800 dark:text-neutral-100">
            {candidates?.length ? "Choose a cover" : "Find online"}
          </p>
          <button
            onclick={() => { candidates = null; searchNote = ""; }}
            class="text-[12px] font-medium text-warm-500 transition-colors hover:text-warm-800 dark:text-neutral-400 dark:hover:text-white"
          >
            {candidates?.length ? "Cancel" : "Close"}
          </button>
        </div>
        {#if searchNote}
          <p class="mt-1 text-[12px] text-warm-500 dark:text-neutral-400">{searchNote}</p>
        {/if}
        {#if candidates?.length}
          <div class="mt-3 grid max-h-[280px] grid-cols-6 gap-3 overflow-y-auto pb-1">
            {#each candidates.filter((c) => !failedThumbs.has(c.thumb)) as c (c.url)}
              <button
                onclick={() => pickCandidate(c)}
                class="group min-w-0 text-left"
                title="{c.label} — {c.source}"
              >
                <div class="aspect-[2/3] overflow-hidden rounded-lg bg-warm-200 ring-1 ring-black/5 transition-all group-hover:ring-2 group-hover:ring-accent-500 dark:bg-neutral-800 dark:ring-white/10
                  {coverUrl === c.url ? 'ring-2 ring-accent-500' : ''}">
                  <img
                    src={c.thumb}
                    alt={c.label}
                    loading="lazy"
                    class="h-full w-full object-cover"
                    onerror={() => (failedThumbs = new Set(failedThumbs).add(c.thumb))}
                  />
                </div>
                <p class="mt-1 truncate text-[10.5px] text-warm-600 dark:text-neutral-400">{c.label}</p>
                <p class="truncate text-[10px] text-warm-400 dark:text-neutral-600">{c.source}</p>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Body: cover on the left, details on the right -->
    <div class="flex min-h-0 flex-1 gap-6 overflow-y-auto px-6 py-5">
      <div class="w-44 shrink-0">
        <p class={labelClass}>Cover</p>
        <div class="mt-1.5 aspect-square w-full overflow-hidden rounded-xl border border-warm-200 bg-warm-100 dark:border-neutral-800 dark:bg-neutral-950">
          {#if coverUrl && !coverBroken}
            <img
              src={coverSrc(coverUrl)}
              alt="Cover preview"
              class="h-full w-full object-cover"
              onerror={() => (coverBroken = true)}
            />
          {:else}
            <div class="flex h-full w-full flex-col items-center justify-center gap-2 px-3 text-center text-warm-400 dark:text-neutral-600">
              <svg class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
              </svg>
              <span class="text-[11px]">{coverBroken ? "Couldn't load this image" : "No cover"}</span>
            </div>
          {/if}
        </div>
        <div class="mt-2.5 flex flex-col gap-1.5">
          <button
            onclick={chooseCoverFile}
            disabled={choosingFile}
            class="btn-secondary h-8 w-full rounded-lg border text-[12px] font-medium text-warm-700 disabled:opacity-50 dark:text-neutral-300"
          >
            {choosingFile ? "Choosing…" : "Choose image…"}
          </button>
          <button
            onclick={findOnline}
            disabled={fetching}
            class="btn-secondary h-8 w-full rounded-lg border text-[12px] font-medium text-warm-700 disabled:opacity-50 dark:text-neutral-300"
          >
            {fetching ? "Searching…" : "Find online"}
          </button>
          {#if coverUrl}
            <button
              onclick={() => (coverUrl = "")}
              class="h-7 w-full rounded-lg text-[12px] font-medium text-warm-500 transition-colors hover:text-red-500 dark:text-neutral-500 dark:hover:text-red-400"
            >
              Remove cover
            </button>
          {/if}
        </div>
      </div>

      <div class="min-w-0 flex-1 space-y-4">
        <div>
          <label class={labelClass} for="meta-title">Title</label>
          <input id="meta-title" type="text" bind:value={title} class={fieldClass} />
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class={labelClass} for="meta-author">Author</label>
            <input id="meta-author" type="text" bind:value={author} class={fieldClass} />
          </div>
          <div>
            <label class={labelClass} for="meta-narrator">Narrator</label>
            <input id="meta-narrator" type="text" bind:value={narrator} placeholder="Narrator name" class={fieldClass} />
          </div>
        </div>

        <div>
          <div class="flex gap-3">
            <div class="min-w-0 flex-1">
              <label class={labelClass} for="meta-series">Series</label>
              <input id="meta-series" type="text" bind:value={series} placeholder="Series name" class={fieldClass} />
            </div>
            <div class="w-24 shrink-0">
              <label class={labelClass} for="meta-series-index">Book #</label>
              <input
                id="meta-series-index"
                type="text"
                inputmode="decimal"
                bind:value={seriesIndex}
                placeholder="1"
                aria-invalid={!seriesIndexValid}
                aria-describedby="meta-series-index-error"
                class="{fieldClass} tabular-nums"
              />
            </div>
          </div>
          {#if !seriesIndexValid}
            <p id="meta-series-index-error" class="mt-1 text-right text-[11px] text-red-500">Book # must be a number, e.g. 2 or 2.5</p>
          {/if}
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class={labelClass} for="meta-genres">Genres</label>
            <TagInput id="meta-genres" bind:values={genres} suggestions={libraryState.allGenres.map((g) => g.name)} placeholder="e.g. Fantasy" />
          </div>
          <div>
            <label class={labelClass} for="meta-tags">Tags</label>
            <TagInput id="meta-tags" bind:values={tags} suggestions={libraryState.allTags.map((t) => t.name)} placeholder="Your own labels" />
          </div>
        </div>

        <div>
          <label class={labelClass} for="meta-description">Description</label>
          <textarea
            id="meta-description"
            bind:value={description}
            rows="7"
            class="{fieldClass} block min-h-[6rem] max-h-[50vh] resize-y leading-relaxed"
          ></textarea>
        </div>

        <div>
          <label class={labelClass} for="meta-cover">Cover image address</label>
          <input
            id="meta-cover"
            type="text"
            bind:value={coverUrl}
            placeholder="https://… or a file path"
            class="{fieldClass} text-[12px]"
          />
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="flex items-center justify-end gap-2 border-t border-warm-200 bg-warm-100 px-6 py-3.5 dark:border-neutral-800 dark:bg-neutral-950">
      <button
        onclick={onclose}
        class="btn-secondary h-9 rounded-lg border px-4 text-[13px] font-medium text-warm-700 dark:text-neutral-200"
      >
        Cancel
      </button>
      <button
        onclick={save}
        disabled={saving || !seriesIndexValid}
        class="btn-primary h-9 rounded-lg px-5 text-[13px] font-semibold disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save changes"}
      </button>
    </div>
  </div>
</div>
