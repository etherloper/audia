<script lang="ts">
  import { uiState } from "../../state/ui.svelte";
  import Sidebar from "./Sidebar.svelte";
  import TopBar from "./TopBar.svelte";
  import PlayerBar from "../player/PlayerBar.svelte";
  import Home from "../home/Home.svelte";
  import LibraryGrid from "../library/LibraryGrid.svelte";
  import BookDetail from "../book/BookDetail.svelte";
  import Settings from "../settings/Settings.svelte";
  import Stats from "../stats/Stats.svelte";
  import DropImport from "../library/DropImport.svelte";
  import QuickSearch from "../shared/QuickSearch.svelte";
  import Welcome from "../shared/Welcome.svelte";
  import Toast from "../shared/Toast.svelte";
  import MiniPlayer from "../player/MiniPlayer.svelte";
  import { miniPlayerState } from "../../state/miniPlayer.svelte";
</script>

{#if miniPlayerState.active}
  <MiniPlayer />
{:else}
<div class="flex h-screen w-screen flex-col overflow-hidden rounded-lg bg-canvas text-warm-900 dark:text-neutral-100">
  <div class="flex min-h-0 flex-1">
    <Sidebar />
    <div class="flex min-w-0 flex-1 flex-col overflow-hidden">
      <TopBar />
      <main class="min-h-0 flex-1 overflow-hidden">
        <!-- A quick fade when switching pages -->
        {#key uiState.currentView}
          <div class="view-enter h-full">
            {#if uiState.currentView === "home"}
              <Home />
            {:else if uiState.currentView === "library"}
              <LibraryGrid />
            {:else if uiState.currentView === "book"}
              <BookDetail />
            {:else if uiState.currentView === "settings"}
              <Settings />
            {:else if uiState.currentView === "stats"}
              <Stats />
            {/if}
          </div>
        {/key}
      </main>
    </div>
  </div>
  <PlayerBar />
  <DropImport />
  <QuickSearch />
  <Welcome />

  <Toast />
</div>
{/if}
