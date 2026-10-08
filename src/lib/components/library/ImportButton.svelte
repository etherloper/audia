<script lang="ts">
  import { open } from "@tauri-apps/plugin-dialog";
  import { libraryState } from "../../state/library.svelte";

  async function handleImport() {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select audiobook folder",
    });
    if (selected) {
      await libraryState.importBooks(selected as string);
    }
  }
</script>

<button
  onclick={handleImport}
  disabled={libraryState.isImporting}
  class="btn-primary inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-[13px] font-medium active:scale-[0.98] disabled:opacity-50"
>
  {#if libraryState.isImporting}
    <svg class="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
    Importing...
  {:else}
    <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
    </svg>
    Import
  {/if}
</button>
