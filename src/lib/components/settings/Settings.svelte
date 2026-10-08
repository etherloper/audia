<script lang="ts">
  import { uiState } from "../../state/ui.svelte";
  import { ACCENTS } from "../../utils/accents";
  import { libraryState } from "../../state/library.svelte";
  import { playerState } from "../../state/player.svelte";
  import { getDb } from "../../utils/db";
  import { open } from "@tauri-apps/plugin-dialog";
  import ConfirmDialog from "../shared/ConfirmDialog.svelte";
  import SpeedSlider from "../shared/SpeedSlider.svelte";
  import { updaterState } from "../../state/updater.svelte";
  import { openWelcome } from "../shared/Welcome.svelte";
  import {
    settingsState,
    SKIP_OPTIONS,
    REWIND_ON_RESUME_OPTIONS,
  } from "../../state/settings.svelte";

  import { applyRestore, createBackup, prepareRestore, type RestorePlan } from "../../state/backup";
  import { invoke } from "@tauri-apps/api/core";
  import { logError } from "../../utils/log";

  function openLogFolder() {
    invoke("open_log_folder").catch((e) => uiState.showToast(`Couldn't open the log folder: ${e}`, { kind: "error" }));
  }

  let backingUp = $state(false);
  let restorePlan = $state<RestorePlan | null>(null);
  let restoring = $state(false);

  async function backUp() {
    backingUp = true;
    try {
      const path = await createBackup();
      if (path) uiState.showToast(`Backup saved to ${path}`, { durationMs: 8000, kind: "success" });
    } catch (e) {
      logError("Backup failed", e);
      uiState.showToast(`Backup failed: ${e instanceof Error ? e.message : e}`, { kind: "error" });
    } finally {
      backingUp = false;
    }
  }

  async function chooseBackup() {
    try {
      const plan = await prepareRestore();
      if (!plan) return;
      if (plan.matched === 0 && plan.settingsCount === 0) {
        uiState.showToast("None of the books in that backup are in your library, so there's nothing to restore.");
        return;
      }
      restorePlan = plan;
    } catch (e) {
      uiState.showToast(e instanceof Error ? e.message : `Couldn't read the backup: ${e}`, { durationMs: 8000, kind: "error" });
    }
  }

  function describeRestore(plan: RestorePlan): string {
    const made = new Date(plan.backup.exported_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    const parts = [`Backup made ${made}.`];
    if (plan.matched > 0) {
      parts.push(
        `${plan.matched} ${plan.matched === 1 ? "book" : "books"} found in your library: their progress and metadata will be replaced with the backup's, and ${plan.bookmarkCount} ${plan.bookmarkCount === 1 ? "bookmark" : "bookmarks"} added where missing.`,
      );
    }
    if (plan.missing > 0) {
      parts.push(`${plan.missing} ${plan.missing === 1 ? "book isn't" : "books aren't"} in your library and will be skipped.`);
    }
    if (plan.settingsCount > 0) parts.push("Your settings will also be restored.");
    parts.push("Playback will stop and the app will reload.");
    return parts.join(" ");
  }

  async function confirmRestore() {
    if (!restorePlan) return;
    const plan = restorePlan;
    restorePlan = null;
    restoring = true;
    try {
      await applyRestore(plan);
      location.reload();
    } catch (e) {
      logError("Restore failed", e);
      restoring = false;
      uiState.showToast(`Restore failed partway: ${e instanceof Error ? e.message : e}`, { durationMs: 10000, kind: "error" });
    }
  }

  const shortcuts = [
    { keys: ["Space"], action: "Play / pause" },
    { keys: ["←", "→"], action: "Skip back / forward" },
    { keys: ["Shift", "←", "→"], action: "Previous / next chapter" },
    { keys: ["[", "]"], action: "Slower / faster" },
    { keys: ["↑", "↓"], action: "Volume" },
    { keys: ["M"], action: "Mute" },
    { keys: ["B"], action: "Add bookmark" },
    { keys: ["Ctrl", "Shift", "M"], action: "Mini player" },
    { keys: ["Ctrl", "K"], action: "Quick search" },
  ];

  let clearing = $state(false);
  let clearMessage = $state("");
  let showConfirmClearFolder = $state(false);
  let showConfirmClearHistory = $state(false);
  let showConfirmClearLibrary = $state(false);

  async function chooseAudiobookFolder() {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select audiobook library folder",
    });
    if (selected) {
      await libraryState.setAudiobookFolder(selected as string);
    }
  }

  async function clearAudiobookFolder() {
    showConfirmClearFolder = false;
    await libraryState.setAudiobookFolder("");
  }

  async function clearListenHistory() {
    showConfirmClearHistory = false;
    clearing = true;
    clearMessage = "";
    try {
      const db = await getDb();
      await db.execute("DELETE FROM progress");
      await db.execute("DELETE FROM bookmarks");
      await db.execute("DELETE FROM listening_log");
      clearMessage = "Listen history and bookmarks cleared.";
    } catch (e) {
      logError("Clearing listen history failed", e);
      clearMessage = "Failed to clear history.";
    }
    clearing = false;
  }

  async function clearEntireLibrary() {
    showConfirmClearLibrary = false;
    clearing = true;
    clearMessage = "";
    try {
      playerState.clearState();
      const db = await getDb();
      await db.execute("DELETE FROM bookmarks");
      await db.execute("DELETE FROM progress");
      await db.execute("DELETE FROM listening_log");
      await db.execute("DELETE FROM chapters");
      await db.execute("DELETE FROM books");
      await libraryState.loadBooks();
      clearMessage = "Library cleared. Re-import your audiobooks.";
    } catch (e) {
      logError("Clearing library failed", e);
      clearMessage = "Failed to clear library.";
    }
    clearing = false;
  }
</script>

<div class="h-full overflow-y-auto p-6">
  <div class="mx-auto max-w-md space-y-8">
    <h1 class="text-xl font-bold">Settings</h1>

    <!-- Appearance -->
    <section class="space-y-2">
      <h2 class="text-[11px] font-semibold uppercase tracking-wider text-warm-400 dark:text-neutral-500">Appearance</h2>
      <div class="rounded-lg border border-warm-200 bg-warm-50 dark:border-neutral-800 dark:bg-neutral-900">
        <div class="flex items-center justify-between px-4 py-3">
          <div>
            <p class="text-[13px] font-medium">Theme</p>
            <p class="text-[11px] text-warm-500 dark:text-neutral-500">Dark, light, or match system</p>
          </div>
          <div class="flex overflow-hidden rounded-md border border-warm-200 dark:border-neutral-700">
            <button
              onclick={() => (uiState.theme = "light")}
              class="flex h-8 items-center gap-1.5 px-2.5 text-[12px] font-medium transition-colors
                {uiState.theme === 'light' ? 'bg-warm-800 text-white dark:bg-white dark:text-black' : 'text-warm-500 hover:bg-warm-100 dark:text-neutral-400 dark:hover:bg-neutral-800'}"
            >
              <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              Light
            </button>
            <button
              onclick={() => (uiState.theme = "dark")}
              class="flex h-8 items-center gap-1.5 border-x border-warm-200 px-2.5 text-[12px] font-medium transition-colors dark:border-neutral-700
                {uiState.theme === 'dark' ? 'bg-warm-800 text-white dark:bg-white dark:text-black' : 'text-warm-500 hover:bg-warm-100 dark:text-neutral-400 dark:hover:bg-neutral-800'}"
            >
              <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
              Dark
            </button>
            <button
              onclick={() => (uiState.theme = "system")}
              class="flex h-8 items-center gap-1.5 px-2.5 text-[12px] font-medium transition-colors
                {uiState.theme === 'system' ? 'bg-warm-800 text-white dark:bg-white dark:text-black' : 'text-warm-500 hover:bg-warm-100 dark:text-neutral-400 dark:hover:bg-neutral-800'}"
            >
              <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              System
            </button>
          </div>
        </div>
        <div class="border-t border-warm-200 dark:border-neutral-800"></div>
        <div class="flex items-center justify-between px-4 py-3">
          <div>
            <p class="text-[13px] font-medium">Accent color</p>
            <p class="text-[11px] text-warm-500 dark:text-neutral-500">Used for playback controls and highlights</p>
          </div>
          <div class="flex items-center gap-2">
            {#each ACCENTS as preset (preset.id)}
              <button
                onclick={() => (uiState.accent = preset.id)}
                title={preset.id === "default" ? "Default (follows theme)" : preset.label}
                aria-label="{preset.label} accent"
                aria-pressed={uiState.accent === preset.id}
                class="flex h-6 w-6 items-center justify-center rounded-full border border-black/10 transition-all duration-150 hover:scale-110 active:scale-95 dark:border-white/20
                  {preset.id === 'default' ? 'bg-warm-700 dark:bg-white' : ''}
                  {uiState.accent === preset.id
                    ? 'ring-2 ring-warm-800 ring-offset-2 ring-offset-warm-50 dark:ring-white dark:ring-offset-neutral-900'
                    : ''}"
                style={preset.id === "default" ? "" : `background: ${preset.shades[500]}`}
              >
                {#if uiState.accent === preset.id}
                  <svg class="h-3 w-3 text-accent-fg/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                {/if}
              </button>
            {/each}
          </div>
        </div>
      </div>
    </section>

    <!-- Playback -->
    <section class="space-y-2">
      <h2 class="text-[11px] font-semibold uppercase tracking-wider text-warm-400 dark:text-neutral-500">Playback</h2>
      <div class="rounded-lg border border-warm-200 bg-warm-50 dark:border-neutral-800 dark:bg-neutral-900">
        {#snippet optionRow(label: string, hint: string, options: readonly number[], value: number, onpick: (v: number) => void, format: (v: number) => string)}
          <div class="flex items-center justify-between gap-4 px-4 py-3">
            <div class="min-w-0">
              <p class="text-[13px] font-medium">{label}</p>
              <p class="text-[11px] text-warm-500 dark:text-neutral-500">{hint}</p>
            </div>
            <div class="flex shrink-0 overflow-hidden rounded-md border border-warm-200 dark:border-neutral-700">
              {#each options as opt, i}
                <button
                  onclick={() => onpick(opt)}
                  aria-pressed={value === opt}
                  class="h-8 min-w-[38px] px-2 text-[12px] font-medium tabular-nums transition-colors
                    {i > 0 ? 'border-l border-warm-200 dark:border-neutral-700' : ''}
                    {value === opt ? 'bg-warm-800 text-white dark:bg-white dark:text-black' : 'text-warm-500 hover:bg-warm-100 dark:text-neutral-400 dark:hover:bg-neutral-800'}"
                >
                  {format(opt)}
                </button>
              {/each}
            </div>
          </div>
        {/snippet}

        <div class="flex items-center justify-between gap-4 px-4 py-3">
          <div class="min-w-0">
            <label class="text-[13px] font-medium" for="default-speed">Default speed</label>
            <p class="text-[11px] text-warm-500 dark:text-neutral-500">For books you haven't played yet. After that, each book remembers its own speed.</p>
          </div>
          <div class="flex shrink-0 items-start gap-3">
            <span class="w-11 pt-px text-right text-[13px] font-semibold tabular-nums">{settingsState.defaultSpeed}×</span>
            <div class="w-[220px]">
              <SpeedSlider id="default-speed" label="Default speed" value={settingsState.defaultSpeed} onchange={(v) => (settingsState.defaultSpeed = v)} />
            </div>
          </div>
        </div>
        <div class="border-t border-warm-200 dark:border-neutral-800"></div>
        {@render optionRow("Skip back", "Back button and ← key", SKIP_OPTIONS, settingsState.skipBackSecs, (v) => (settingsState.skipBackSecs = v), (v) => `${v}s`)}
        <div class="border-t border-warm-200 dark:border-neutral-800"></div>
        {@render optionRow("Skip forward", "Forward button and → key", SKIP_OPTIONS, settingsState.skipForwardSecs, (v) => (settingsState.skipForwardSecs = v), (v) => `${v}s`)}
        <div class="border-t border-warm-200 dark:border-neutral-800"></div>
        <div class="flex items-center justify-between gap-4 px-4 py-3">
          <div class="min-w-0">
            <p class="text-[13px] font-medium">Progress bar shows</p>
            <p class="text-[11px] text-warm-500 dark:text-neutral-500">You can also click the time left under the controls</p>
          </div>
          <div class="flex shrink-0 overflow-hidden rounded-md border border-warm-200 dark:border-neutral-700">
            {#each [["chapter", "Chapter"], ["book", "Whole book"]] as [value, label], i}
              <button
                onclick={() => (settingsState.progressScope = value as "chapter" | "book")}
                aria-pressed={settingsState.progressScope === value}
                class="h-8 px-2.5 text-[12px] font-medium transition-colors
                  {i > 0 ? 'border-l border-warm-200 dark:border-neutral-700' : ''}
                  {settingsState.progressScope === value ? 'bg-warm-800 text-white dark:bg-white dark:text-black' : 'text-warm-500 hover:bg-warm-100 dark:text-neutral-400 dark:hover:bg-neutral-800'}"
              >
                {label}
              </button>
            {/each}
          </div>
        </div>
        <div class="border-t border-warm-200 dark:border-neutral-800"></div>
        <div class="flex items-center justify-between gap-4 px-4 py-3">
          <div class="min-w-0">
            <p class="text-[13px] font-medium" id="voice-boost-label">Voice boost</p>
            <p class="text-[11px] text-warm-500 dark:text-neutral-500">Evens out the volume so quiet narration is easier to hear</p>
          </div>
          <button
            role="switch"
            aria-checked={settingsState.voiceBoost}
            aria-labelledby="voice-boost-label"
            onclick={() => playerState.setVoiceBoost(!settingsState.voiceBoost)}
            class="relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200
              {settingsState.voiceBoost ? 'bg-accent-500' : 'bg-warm-300 dark:bg-neutral-700'}"
          >
            <span
              class="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200
                {settingsState.voiceBoost ? 'translate-x-4' : ''}"
            ></span>
          </button>
        </div>
        <div class="border-t border-warm-200 dark:border-neutral-800"></div>
        {@render optionRow("Rewind on resume", "Step back a little after a pause, so you don't lose your place", REWIND_ON_RESUME_OPTIONS, settingsState.rewindOnResumeSecs, (v) => (settingsState.rewindOnResumeSecs = v), (v) => (v === 0 ? "Off" : `${v}s`))}
      </div>
    </section>

    <!-- Window -->
    <section class="space-y-2">
      <h2 class="text-[11px] font-semibold uppercase tracking-wider text-warm-400 dark:text-neutral-500">Window</h2>
      <div class="rounded-lg border border-warm-200 bg-warm-50 dark:border-neutral-800 dark:bg-neutral-900">
        <div class="flex items-center justify-between gap-4 px-4 py-3">
          <div class="min-w-0">
            <p class="text-[13px] font-medium" id="close-to-tray-label">Keep running in the system tray</p>
            <p class="text-[11px] text-warm-500 dark:text-neutral-500">
              {settingsState.closeToTray
                ? "Closing the window hides Audia to the tray and playback continues. Use Quit in the tray menu to exit."
                : "Closing the window quits Audia."}
            </p>
          </div>
          <button
            role="switch"
            aria-checked={settingsState.closeToTray}
            aria-labelledby="close-to-tray-label"
            onclick={() => (settingsState.closeToTray = !settingsState.closeToTray)}
            class="relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200
              {settingsState.closeToTray ? 'bg-accent-500' : 'bg-warm-300 dark:bg-neutral-700'}"
          >
            <span
              class="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200
                {settingsState.closeToTray ? 'translate-x-4' : ''}"
            ></span>
          </button>
        </div>
      </div>
    </section>

    <!-- Library -->
    <section class="space-y-2">
      <h2 class="text-[11px] font-semibold uppercase tracking-wider text-warm-400 dark:text-neutral-500">Library</h2>
      <div class="rounded-lg border border-warm-200 bg-warm-50 dark:border-neutral-800 dark:bg-neutral-900">
        <div class="flex items-center justify-between px-4 py-3">
          <div class="min-w-0 flex-1">
            <p class="text-[13px] font-medium">Audiobook folder</p>
            {#if libraryState.audiobookFolder}
              <p class="mt-0.5 truncate text-[11px] text-warm-500 dark:text-neutral-500">{libraryState.audiobookFolder}</p>
            {:else}
              <p class="mt-0.5 text-[11px] text-warm-500 dark:text-neutral-500">Not set. Choose a folder to import your audiobooks automatically.</p>
            {/if}
            {#if libraryState.audiobookFolder}
              <p class="mt-0.5 text-[11px] text-warm-400 dark:text-neutral-600">Drop books onto the window to copy them here</p>
            {/if}
          </div>
          <div class="flex items-center gap-2 ml-3 shrink-0">
            {#if libraryState.audiobookFolder}
              <button
                onclick={() => (showConfirmClearFolder = true)}
                class="btn-secondary flex h-8 shrink-0 items-center whitespace-nowrap rounded-md border px-3 text-[13px] font-medium text-warm-500 dark:text-neutral-400"
              >
                Clear
              </button>
            {/if}
            <button
              onclick={chooseAudiobookFolder}
              class="btn-secondary flex h-8 shrink-0 items-center whitespace-nowrap rounded-md border px-3 text-[13px] font-medium"
            >
              {libraryState.audiobookFolder ? "Change" : "Choose folder"}
            </button>
          </div>
        </div>
        <div class="flex items-center justify-between border-t border-warm-200 px-4 py-3 dark:border-neutral-800">
          <div class="min-w-0 flex-1">
            <p class="text-[13px] font-medium">Find missing covers &amp; descriptions</p>
            {#if libraryState.detailsSearch}
              {@const search = libraryState.detailsSearch}
              <div class="mt-1.5 flex items-center gap-2">
                <div class="h-1 w-40 overflow-hidden rounded-full bg-warm-200 dark:bg-white/[0.08]">
                  <div class="h-full rounded-full bg-accent-500 transition-[width] duration-300" style="width: {(search.done / search.total) * 100}%"></div>
                </div>
                <span class="text-[11px] tabular-nums text-warm-500 dark:text-neutral-500">{search.done} of {search.total}</span>
              </div>
            {:else}
              <p class="mt-0.5 text-[11px] text-warm-500 dark:text-neutral-500">
                {#if libraryState.missingDetailsCount === 0}
                  Every book has a cover and a description.
                {:else}
                  {libraryState.missingDetailsCount} {libraryState.missingDetailsCount === 1 ? "book is" : "books are"} missing one or both. Searches Open Library and Google Books by title and author; nothing you've set is replaced.
                {/if}
              </p>
            {/if}
          </div>
          <div class="ml-3 shrink-0">
            {#if libraryState.detailsSearch}
              <button
                onclick={() => libraryState.cancelDetailsSearch()}
                class="btn-secondary flex h-8 shrink-0 items-center whitespace-nowrap rounded-md border px-3 text-[13px] font-medium"
              >
                Stop
              </button>
            {:else}
              <button
                onclick={() => libraryState.findMissingDetails()}
                disabled={libraryState.missingDetailsCount === 0}
                class="btn-secondary flex h-8 shrink-0 items-center whitespace-nowrap rounded-md border px-3 text-[13px] font-medium disabled:opacity-50"
              >
                Find
              </button>
            {/if}
          </div>
        </div>
      </div>
    </section>

    <!-- Data Management -->
    <section class="space-y-2">
      <h2 class="text-[11px] font-semibold uppercase tracking-wider text-warm-400 dark:text-neutral-500">Data</h2>
      <div class="rounded-lg border border-warm-200 bg-warm-50 dark:border-neutral-800 dark:bg-neutral-900">
        <div class="flex items-center justify-between px-4 py-3">
          <div>
            <p class="text-[13px] font-medium">Back up</p>
            <p class="text-[11px] text-warm-500 dark:text-neutral-500">Save progress, bookmarks, edits and settings to a file</p>
          </div>
          <button
            onclick={backUp}
            disabled={backingUp}
            class="btn-secondary flex h-8 shrink-0 items-center whitespace-nowrap rounded-md border px-3 text-[13px] font-medium disabled:opacity-50"
          >
            {backingUp ? "Saving…" : "Back up…"}
          </button>
        </div>
        <div class="border-t border-warm-200 dark:border-neutral-700"></div>
        <div class="flex items-center justify-between px-4 py-3">
          <div>
            <p class="text-[13px] font-medium">Restore</p>
            <p class="text-[11px] text-warm-500 dark:text-neutral-500">Load a backup into this library. You'll see what it will change before anything is applied.</p>
          </div>
          <button
            onclick={chooseBackup}
            disabled={restoring}
            class="btn-secondary flex h-8 shrink-0 items-center whitespace-nowrap rounded-md border px-3 text-[13px] font-medium disabled:opacity-50"
          >
            {restoring ? "Restoring…" : "Restore…"}
          </button>
        </div>
        <div class="border-t border-warm-200 dark:border-neutral-700"></div>
        <div class="flex items-center justify-between px-4 py-3">
          <div>
            <p class="text-[13px] font-medium">Clear listen history</p>
            <p class="text-[11px] text-warm-500 dark:text-neutral-500">Reset playback progress and bookmarks</p>
          </div>
          <button
            onclick={() => (showConfirmClearHistory = true)}
            disabled={clearing}
            class="flex h-8 items-center rounded-md border border-warm-200 px-3 text-[13px] font-medium text-red-500 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-red-500/10"
          >
            {clearing ? "..." : "Clear"}
          </button>
        </div>
        <div class="border-t border-warm-200 dark:border-neutral-700"></div>
        <div class="flex items-center justify-between px-4 py-3">
          <div>
            <p class="text-[13px] font-medium">Clear entire library</p>
            <p class="text-[11px] text-warm-500 dark:text-neutral-500">Remove all books, re-import fresh</p>
          </div>
          <button
            onclick={() => (showConfirmClearLibrary = true)}
            disabled={clearing}
            class="flex h-8 items-center rounded-md border border-warm-200 px-3 text-[13px] font-medium text-red-500 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-red-500/10"
          >
            {clearing ? "..." : "Clear all"}
          </button>
        </div>
      </div>
      {#if clearMessage}
        <p class="text-[11px] text-warm-500 dark:text-neutral-500">{clearMessage}</p>
      {/if}
    </section>

    <!-- Keyboard shortcuts -->
    <section class="space-y-2">
      <h2 class="text-[11px] font-semibold uppercase tracking-wider text-warm-400 dark:text-neutral-500">Keyboard shortcuts</h2>
      <div class="rounded-lg border border-warm-200 bg-warm-50 py-1 dark:border-neutral-800 dark:bg-neutral-900">
        {#each shortcuts as shortcut}
          <div class="flex items-center justify-between px-4 py-1.5">
            <span class="text-[13px]">{shortcut.action}</span>
            <span class="flex gap-1">
              {#each shortcut.keys as key}
                <kbd class="min-w-[22px] rounded border border-warm-200 bg-white px-1.5 py-0.5 text-center text-[11px] font-medium text-warm-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">{key}</kbd>
              {/each}
            </span>
          </div>
        {/each}
      </div>
    </section>

    <!-- About -->
    <section class="space-y-2">
      <h2 class="text-[11px] font-semibold uppercase tracking-wider text-warm-400 dark:text-neutral-500">About</h2>
      <div class="rounded-lg border border-warm-200 bg-warm-50 dark:border-neutral-800 dark:bg-neutral-900">
        <div class="px-4 py-3">
          <p class="text-[13px] font-medium">Audia</p>
          <p class="text-[11px] text-warm-500 dark:text-neutral-500">
            Offline audiobook player{#if updaterState.currentVersion} &middot; v{updaterState.currentVersion}{/if}
          </p>
        </div>
        <div class="flex items-center justify-between gap-4 border-t border-warm-200 px-4 py-3 dark:border-neutral-800">
          <div class="min-w-0">
            <p class="text-[13px] font-medium">Updates</p>
            {#if updaterState.status === "checking"}
              <p class="text-[11px] text-warm-500 dark:text-neutral-500">Checking…</p>
            {:else if updaterState.status === "up-to-date"}
              <p class="text-[11px] text-warm-500 dark:text-neutral-500">You're on the latest version.</p>
            {:else if updaterState.status === "available" && updaterState.available}
              <p class="text-[11px] font-medium text-accent-600 dark:text-accent-400">Version {updaterState.available.version} is available.</p>
            {:else if updaterState.status === "downloading"}
              {@const p = updaterState.progress}
              <div class="mt-1.5 flex items-center gap-2">
                <div class="h-1 w-40 overflow-hidden rounded-full bg-warm-200 dark:bg-white/[0.08]">
                  <div class="h-full rounded-full bg-accent-500 transition-[width] duration-300" style="width: {p.total ? Math.min(100, (p.downloaded / p.total) * 100) : 0}%"></div>
                </div>
                <span class="text-[11px] tabular-nums text-warm-500 dark:text-neutral-500">
                  {p.total ? `${Math.round((p.downloaded / p.total) * 100)}%` : "Downloading…"}
                </span>
              </div>
            {:else if updaterState.status === "installing"}
              <p class="text-[11px] text-warm-500 dark:text-neutral-500">Installing. Audia will restart.</p>
            {:else if updaterState.status === "error"}
              <p class="text-[11px] text-red-500">Couldn't check for updates. Try again later.</p>
            {:else}
              <p class="text-[11px] text-warm-500 dark:text-neutral-500">New versions are published on GitHub.</p>
            {/if}
          </div>
          {#if updaterState.status === "available"}
            <button
              onclick={() => updaterState.installUpdate()}
              class="btn-primary flex h-8 shrink-0 items-center whitespace-nowrap rounded-md px-3 text-[13px] font-medium"
            >
              Update and restart
            </button>
          {:else}
            <button
              onclick={() => updaterState.checkForUpdates()}
              disabled={updaterState.status === "checking" || updaterState.status === "downloading" || updaterState.status === "installing"}
              class="btn-secondary flex h-8 shrink-0 items-center whitespace-nowrap rounded-md border px-3 text-[13px] font-medium disabled:opacity-50"
            >
              Check for updates
            </button>
          {/if}
        </div>
        <div class="flex items-center justify-between gap-4 border-t border-warm-200 px-4 py-3 dark:border-neutral-800">
          <div class="min-w-0">
            <p class="text-[13px] font-medium" id="auto-update-label">Check automatically</p>
            <p class="text-[11px] text-warm-500 dark:text-neutral-500">Look for a new version shortly after Audia starts</p>
          </div>
          <button
            role="switch"
            aria-checked={updaterState.autoCheck}
            aria-labelledby="auto-update-label"
            onclick={() => (updaterState.autoCheck = !updaterState.autoCheck)}
            class="relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200
              {updaterState.autoCheck ? 'bg-accent-500' : 'bg-warm-300 dark:bg-neutral-700'}"
          >
            <span
              class="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200
                {updaterState.autoCheck ? 'translate-x-4' : ''}"
            ></span>
          </button>
        </div>
        <div class="flex items-center justify-between gap-4 border-t border-warm-200 px-4 py-3 dark:border-neutral-800">
          <div class="min-w-0">
            <p class="text-[13px] font-medium">Welcome screen</p>
            <p class="text-[11px] text-warm-500 dark:text-neutral-500">Go through the first-run setup and tips again</p>
          </div>
          <button
            onclick={openWelcome}
            class="btn-secondary flex h-8 shrink-0 items-center whitespace-nowrap rounded-md border px-3 text-[13px] font-medium"
          >
            Show welcome
          </button>
        </div>
        <div class="flex items-center justify-between gap-4 border-t border-warm-200 px-4 py-3 dark:border-neutral-800">
          <div class="min-w-0">
            <p class="text-[13px] font-medium">Logs</p>
            <p class="text-[11px] text-warm-500 dark:text-neutral-500">Help diagnose problems. Include them when reporting a bug.</p>
          </div>
          <button
            onclick={openLogFolder}
            class="btn-secondary flex h-8 shrink-0 items-center whitespace-nowrap rounded-md border px-3 text-[13px] font-medium"
          >
            Open log folder
          </button>
        </div>
      </div>
    </section>
  </div>
</div>

<!-- Confirmation dialogs -->
<ConfirmDialog
  open={showConfirmClearFolder}
  title="Clear audiobook folder?"
  description="This will unlink your audiobook folder and remove all imported books from the library. Your audio files on disk are not touched. Listening progress and bookmarks for those books will be lost."
  confirmLabel="Clear folder"
  danger
  onconfirm={clearAudiobookFolder}
  oncancel={() => (showConfirmClearFolder = false)}
/>

<ConfirmDialog
  open={restorePlan !== null}
  title="Restore from backup?"
  description={restorePlan ? describeRestore(restorePlan) : ""}
  confirmLabel="Restore"
  onconfirm={confirmRestore}
  oncancel={() => (restorePlan = null)}
/>

<ConfirmDialog
  open={showConfirmClearHistory}
  title="Clear listen history?"
  description="This will reset playback progress for every book and delete all bookmarks and listening history. Your books and metadata will be kept."
  confirmLabel="Clear history"
  danger
  onconfirm={clearListenHistory}
  oncancel={() => (showConfirmClearHistory = false)}
/>

<ConfirmDialog
  open={showConfirmClearLibrary}
  title="Clear entire library?"
  description="This will permanently delete all books, chapters, progress, and bookmarks. You'll need to re-import your audiobooks."
  confirmLabel="Clear everything"
  danger
  onconfirm={clearEntireLibrary}
  oncancel={() => (showConfirmClearLibrary = false)}
/>
