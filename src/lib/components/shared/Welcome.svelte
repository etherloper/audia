<script lang="ts" module>
  const DONE_KEY = "audia-welcome-done";

  function readDone(): boolean {
    try {
      return localStorage.getItem(DONE_KEY) === "1";
    } catch {
      return false;
    }
  }

  let visible = $state(false);
  // Settings → "Show welcome" opens it again on demand
  export function openWelcome() {
    visible = true;
  }
</script>

<script lang="ts">
  import { open } from "@tauri-apps/plugin-dialog";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { libraryState } from "../../state/library.svelte";
  import { uiState } from "../../state/ui.svelte";
  import { ACCENTS } from "../../utils/accents";

  /**
   * First-run setup: shown once on a fresh install (no books, no folder) to pick
   * the audiobook folder and the look, with a few tips at the end.
   */

  // Decided once, when the library has loaded. After that it stays open until
  // finished, even though choosing a folder in step 2 changes what it checks.
  let checked = false;
  $effect(() => {
    if (checked || !libraryState.loaded) return;
    checked = true;
    if (!readDone() && libraryState.books.length === 0 && !libraryState.audiobookFolder) visible = true;
  });

  const STEPS = ["welcome", "library", "look", "ready"] as const;
  let step = $state(0);
  let choosing = $state(false);

  // Reopened from Settings: start from the beginning
  $effect(() => {
    if (visible) step = 0;
  });

  function finish() {
    try {
      localStorage.setItem(DONE_KEY, "1");
    } catch {
      // It'll just show again next time
    }
    visible = false;
    if (libraryState.books.length > 0) uiState.navigateToLibrary();
    else uiState.navigateToHome();
  }

  async function chooseFolder() {
    choosing = true;
    try {
      const selected = await open({ directory: true, multiple: false, title: "Select your audiobook folder" });
      if (selected) await libraryState.setAudiobookFolder(selected as string);
    } finally {
      choosing = false;
    }
  }

  // The overlay covers the top bar, so let its top edge move the window instead
  function dragWindow(e: MouseEvent) {
    if (e.button === 0 && "__TAURI_INTERNALS__" in window) getCurrentWindow().startDragging();
  }

  const themes = [
    { id: "light", label: "Light" },
    { id: "dark", label: "Dark" },
    { id: "system", label: "System" },
  ] as const;

  const tips = [
    { keys: "Ctrl K", text: "Search books, authors, genres and notes" },
    { keys: "Space", text: "Play or pause, from anywhere in the app" },
    { keys: "Ctrl Shift M", text: "Shrink to the mini player" },
    { keys: "Drag", text: "Drop books onto the window to add them to your library" },
  ];
</script>

{#if visible}
  <div class="animate-fadeIn fixed inset-0 z-50 flex items-center justify-center bg-canvas px-6" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="absolute inset-x-0 top-0 h-11" onmousedown={dragWindow}></div>

    <div class="w-full max-w-[460px]">
      <!-- Step dots -->
      <div class="mb-8 flex justify-center gap-1.5" aria-hidden="true">
        {#each STEPS as _, i}
          <span class="h-1.5 rounded-full transition-all duration-300 {i === step ? 'w-5 bg-accent-500' : 'w-1.5 bg-warm-300 dark:bg-neutral-700'}"></span>
        {/each}
      </div>

      {#key step}
        <div class="animate-fadeIn">
          {#if STEPS[step] === "welcome"}
            <div class="text-center">
              <p class="text-[34px] uppercase tracking-[0.2em] text-warm-800 dark:text-neutral-100" style="font-family: 'Zen Dots', cursive;">Audia</p>
              <h1 id="welcome-title" class="mt-3 text-[15px] text-warm-600 dark:text-neutral-400">Your audiobooks, all in one place.</h1>
            </div>
            <ul class="mx-auto mt-8 max-w-[340px] space-y-3.5">
              {#each [
                { title: "Picks up where you left off", text: "Every book remembers its place, chapter and speed." },
                { title: "Chapters, bookmarks and notes", text: "Jump around long books and keep track of the good bits." },
                { title: "Stays out of the way", text: "Mini player, sleep timer and media keys." },
              ] as feature}
                <li class="flex gap-3">
                  <span class="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-500/15 text-accent-600 dark:text-accent-400">
                    <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
                  </span>
                  <div>
                    <p class="text-[13.5px] font-semibold">{feature.title}</p>
                    <p class="text-[12.5px] text-warm-500 dark:text-neutral-500">{feature.text}</p>
                  </div>
                </li>
              {/each}
            </ul>
          {:else if STEPS[step] === "library"}
            <h1 id="welcome-title" class="text-center text-xl font-bold tracking-tight">Where are your audiobooks?</h1>
            <p class="mt-2 text-center text-[13px] leading-relaxed text-warm-500 dark:text-neutral-400">
              Choose the folder you keep them in. Audia adds what's there and watches for new books. A book can be a folder of audio files or a single .m4b.
            </p>
            <div class="mt-6 rounded-xl border border-warm-200 bg-warm-50 p-4 dark:border-neutral-800 dark:bg-neutral-900">
              {#if libraryState.audiobookFolder}
                <div class="flex items-center gap-3">
                  <svg class="h-5 w-5 shrink-0 text-accent-600 dark:text-accent-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" /></svg>
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-[13px] font-medium">{libraryState.audiobookFolder}</p>
                    <p class="text-[12px] text-warm-500 dark:text-neutral-500">
                      {#if libraryState.isImporting}
                        Scanning… {libraryState.books.length} {libraryState.books.length === 1 ? "book" : "books"} so far
                      {:else}
                        Found {libraryState.books.length} {libraryState.books.length === 1 ? "book" : "books"}
                      {/if}
                    </p>
                  </div>
                  <button onclick={chooseFolder} disabled={choosing} class="btn-secondary h-8 shrink-0 rounded-md border px-3 text-[12.5px] font-medium disabled:opacity-50">Change</button>
                </div>
              {:else}
                <button onclick={chooseFolder} disabled={choosing} class="btn-primary flex h-10 w-full items-center justify-center gap-2 rounded-lg text-[13px] font-semibold disabled:opacity-50">
                  <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" /></svg>
                  {choosing ? "Choosing…" : "Choose folder…"}
                </button>
              {/if}
            </div>
            <p class="mt-3 text-center text-[11.5px] text-warm-400 dark:text-neutral-600">You can change this any time in Settings.</p>
          {:else if STEPS[step] === "look"}
            <h1 id="welcome-title" class="text-center text-xl font-bold tracking-tight">Make it yours</h1>
            <p class="mt-2 text-center text-[13px] text-warm-500 dark:text-neutral-400">Pick a theme and an accent colour.</p>
            <div class="mt-6 space-y-5 rounded-xl border border-warm-200 bg-warm-50 p-5 dark:border-neutral-800 dark:bg-neutral-900">
              <div>
                <p class="text-[11px] font-semibold uppercase tracking-wider text-warm-400 dark:text-neutral-500">Theme</p>
                <div class="mt-2 grid grid-cols-3 gap-2">
                  {#each themes as theme}
                    <button
                      onclick={() => (uiState.theme = theme.id)}
                      aria-pressed={uiState.theme === theme.id}
                      class="h-9 rounded-lg border text-[12.5px] font-medium transition-colors
                        {uiState.theme === theme.id
                          ? 'border-accent-500 bg-accent-500/10 text-warm-900 dark:text-white'
                          : 'border-warm-200 text-warm-600 hover:border-warm-300 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-600'}"
                    >
                      {theme.label}
                    </button>
                  {/each}
                </div>
              </div>
              <div>
                <p class="text-[11px] font-semibold uppercase tracking-wider text-warm-400 dark:text-neutral-500">Accent</p>
                <div class="mt-2.5 flex gap-2.5">
                  {#each ACCENTS as preset (preset.id)}
                    <button
                      onclick={() => (uiState.accent = preset.id)}
                      title={preset.id === "default" ? "Default (follows theme)" : preset.label}
                      aria-label="{preset.label} accent"
                      aria-pressed={uiState.accent === preset.id}
                      class="h-8 w-8 rounded-full border border-black/10 transition-transform hover:scale-110 active:scale-95 dark:border-white/20
                        {preset.id === 'default' ? 'bg-warm-700 dark:bg-white' : ''}
                        {uiState.accent === preset.id ? 'ring-2 ring-accent-500 ring-offset-2 ring-offset-warm-50 dark:ring-offset-neutral-900' : ''}"
                      style={preset.id === "default" ? "" : `background: ${preset.shades[500]}`}
                    ></button>
                  {/each}
                </div>
              </div>
              <!-- Live preview of the accent on a control -->
              <div class="flex items-center gap-3 border-t border-warm-200 pt-4 dark:border-neutral-800">
                <span class="flex h-9 w-9 items-center justify-center rounded-full bg-accent-500 text-accent-fg">
                  <svg class="ml-0.5 h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                </span>
                <div class="h-1 flex-1 overflow-hidden rounded-full bg-warm-200 dark:bg-white/[0.08]">
                  <div class="h-full w-2/5 rounded-full bg-accent-500"></div>
                </div>
              </div>
            </div>
          {:else}
            <h1 id="welcome-title" class="text-center text-xl font-bold tracking-tight">You're all set</h1>
            <p class="mt-2 text-center text-[13px] text-warm-500 dark:text-neutral-400">A few things worth knowing:</p>
            <ul class="mt-6 divide-y divide-warm-200 rounded-xl border border-warm-200 bg-warm-50 dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-900">
              {#each tips as tip}
                <li class="flex items-center gap-3 px-4 py-3">
                  <kbd class="min-w-[86px] shrink-0 rounded-md border border-warm-200 bg-white px-1.5 py-0.5 text-center text-[11px] font-semibold text-warm-700 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-300">{tip.keys}</kbd>
                  <span class="text-[12.5px] text-warm-700 dark:text-neutral-300">{tip.text}</span>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      {/key}

      <!-- Navigation -->
      <div class="mt-8 flex items-center gap-2">
        {#if step > 0}
          <button onclick={() => step--} class="btn-secondary h-10 rounded-lg border px-4 text-[13px] font-medium">Back</button>
        {:else}
          <button onclick={finish} class="h-10 rounded-lg px-3 text-[12.5px] font-medium text-warm-400 transition-colors hover:text-warm-700 dark:text-neutral-500 dark:hover:text-neutral-300">Skip setup</button>
        {/if}
        <div class="flex-1"></div>
        {#if STEPS[step] === "ready"}
          <button onclick={finish} class="btn-primary h-10 rounded-lg px-6 text-[13px] font-semibold">Start listening</button>
        {:else}
          <button onclick={() => step++} class="btn-primary h-10 rounded-lg px-6 text-[13px] font-semibold">
            {#if STEPS[step] === "welcome"}Get started{:else if STEPS[step] === "library" && !libraryState.audiobookFolder}Skip for now{:else}Continue{/if}
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}
