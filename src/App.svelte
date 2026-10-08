<script lang="ts">
  import { onMount } from "svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { invoke } from "@tauri-apps/api/core";
  import { listen } from "@tauri-apps/api/event";
  import { settingsState } from "./lib/state/settings.svelte";
  import { miniPlayerState } from "./lib/state/miniPlayer.svelte";
  import { sleepTimerState } from "./lib/state/sleepTimer.svelte";
  import { restoreWindowState, saveWindowState, trackWindowState } from "./lib/state/windowState";
  import { installGlobalErrorLogging } from "./lib/utils/log";

  installGlobalErrorLogging();
  import { uiState } from "./lib/state/ui.svelte";
  import { libraryState } from "./lib/state/library.svelte";
  import { playerState } from "./lib/state/player.svelte";
  import AppShell from "./lib/components/layout/AppShell.svelte";
  import Tooltips from "./lib/components/shared/Tooltips.svelte";

  const inTauri = "__TAURI_INTERNALS__" in window;

  // Keep the tray menu and tooltip in sync with playback
  $effect(() => {
    if (!inTauri) return;
    const book = playerState.currentBookId !== null ? libraryState.getBook(playerState.currentBookId) : null;
    invoke("update_tray", {
      title: book?.title ?? null,
      playing: playerState.isPlaying,
      mini: miniPlayerState.active,
      sleep: sleepTimerState.mode.kind === "timed",
    }).catch(() => {});
  });

  // Tell the OS what's playing (media keys, headset buttons, the system media flyout)
  $effect(() => {
    if (!inTauri) return;
    const book = playerState.currentBookId !== null ? libraryState.getBook(playerState.currentBookId) : null;
    const chapter = playerState.currentChapter?.title;
    invoke("update_media_controls", {
      title: book?.title ?? null,
      artist: book ? [book.author, chapter].filter(Boolean).join(" — ") : null,
      coverPath: book?.cover_art ?? null,
      playing: playerState.isPlaying,
    }).catch(() => {});
  });

  // The mini player only makes sense with something loaded
  $effect(() => {
    if (playerState.currentBookId === null && miniPlayerState.active) miniPlayerState.exit();
  });

  onMount(() => {
    uiState.initTheme();
    restoreWindowState();
    let untrackWindow: (() => void) | null = null;
    trackWindowState().then((fn) => (untrackWindow = fn));
    libraryState.init().then(() => {
      libraryState.initWatchFolder();
    });

    // Flush the current position before the window goes away (close button, Alt+F4, etc.)
    let unlistenClose: (() => void) | null = null;
    let unlistenTray: (() => void) | null = null;
    let unlistenMedia: (() => void) | null = null;
    if (inTauri) {
      const appWindow = getCurrentWindow();
      appWindow
        .onCloseRequested(async (event) => {
          await saveWindowState().catch(() => {});
          // Hide to the tray instead of quitting; playback carries on.
          // The tray's Show/Quit items bring it back or exit for real.
          if (settingsState.closeToTray) {
            event.preventDefault();
            await appWindow.hide();
          }
          try {
            await playerState.saveProgress();
          } catch {
            // Never block closing on a failed save
          }
        })
        .then((fn) => (unlistenClose = fn));

      listen<string>("media-control", (event) => {
        if (playerState.currentBookId === null) return;
        switch (event.payload) {
          case "play":
            if (!playerState.isPlaying) playerState.togglePlayPause();
            break;
          case "pause":
            if (playerState.isPlaying) playerState.togglePlayPause();
            break;
          case "toggle":
            playerState.togglePlayPause();
            break;
          case "next":
            if (playerState.currentChapterIndex < playerState.currentChapters.length - 1)
              playerState.goToChapter(playerState.currentChapterIndex + 1);
            break;
          case "previous":
            if (playerState.currentChapterIndex > 0) playerState.goToChapter(playerState.currentChapterIndex - 1);
            break;
          case "forward":
            playerState.skipForward(settingsState.skipForwardSecs);
            break;
          case "back":
            playerState.skipBackward(settingsState.skipBackSecs);
            break;
        }
      }).then((fn) => (unlistenMedia = fn));

      listen<string>("tray-action", async (event) => {
        switch (event.payload) {
          case "play_pause":
            playerState.togglePlayPause();
            break;
          case "prev_chapter":
            if (playerState.currentChapterIndex > 0) playerState.goToChapter(playerState.currentChapterIndex - 1);
            break;
          case "next_chapter":
            if (playerState.currentChapterIndex < playerState.currentChapters.length - 1)
              playerState.goToChapter(playerState.currentChapterIndex + 1);
            break;
          case "sleep_extend":
            sleepTimerState.extend();
            break;
          case "toggle_mini":
            if (playerState.currentBookId !== null || miniPlayerState.active) miniPlayerState.toggle();
            break;
          case "quit":
            await playerState.saveProgress().catch(() => {});
            invoke("quit_app");
            break;
        }
      }).then((fn) => (unlistenTray = fn));
    }

    function handleKeydown(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && e.code === "KeyM") {
        e.preventDefault();
        if (playerState.currentBookId !== null || miniPlayerState.active) miniPlayerState.toggle();
        return;
      }
      if (playerState.currentBookId === null) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      // Leave keys alone while a modal is open
      if (document.querySelector("[aria-modal='true']")) return;

      if (e.shiftKey) {
        // Shift+←/→: previous / next chapter
        if (e.code === "ArrowLeft" && playerState.currentChapterIndex > 0) {
          e.preventDefault();
          playerState.goToChapter(playerState.currentChapterIndex - 1);
        } else if (e.code === "ArrowRight" && playerState.currentChapterIndex < playerState.currentChapters.length - 1) {
          e.preventDefault();
          playerState.goToChapter(playerState.currentChapterIndex + 1);
        }
        return;
      }

      switch (e.code) {
        case "Space":
          e.preventDefault();
          playerState.togglePlayPause();
          break;
        case "ArrowLeft":
          e.preventDefault();
          playerState.skipBackward(settingsState.skipBackSecs);
          break;
        case "ArrowRight":
          e.preventDefault();
          playerState.skipForward(settingsState.skipForwardSecs);
          break;
        case "BracketLeft":
          e.preventDefault();
          playerState.stepPlaybackRate(-1);
          break;
        case "BracketRight":
          e.preventDefault();
          playerState.stepPlaybackRate(1);
          break;
        case "KeyB":
          e.preventDefault();
          playerState.addBookmark();
          break;
        case "KeyM":
          e.preventDefault();
          playerState.toggleMute();
          break;
        case "ArrowUp":
          e.preventDefault();
          playerState.setVolume(Math.min(1, playerState.volume + 0.05));
          break;
        case "ArrowDown":
          e.preventDefault();
          playerState.setVolume(Math.max(0, playerState.volume - 0.05));
          break;
      }
    }

    function handleMouseUp(e: MouseEvent) {
      if (e.button === 3) {
        e.preventDefault();
        uiState.goBack();
      } else if (e.button === 4) {
        e.preventDefault();
        uiState.goForward();
      }
    }

    function handleContextMenu(e: MouseEvent) {
      e.preventDefault();
    }

    window.addEventListener("keydown", handleKeydown);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("contextmenu", handleContextMenu);
    return () => {
      unlistenClose?.();
      untrackWindow?.();
      unlistenTray?.();
      unlistenMedia?.();
      window.removeEventListener("keydown", handleKeydown);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("contextmenu", handleContextMenu);
    };
  });
</script>

<AppShell />
<Tooltips />
